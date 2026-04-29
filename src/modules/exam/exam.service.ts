import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Exam } from 'src/database/entities/exam.entity';
import { ExamAttempt, AttemptStatus } from 'src/database/entities/examAttempt.entity';
import { Question } from 'src/database/entities/question.entity';
import { User } from 'src/database/entities/user.entity';
import { Violation } from 'src/database/entities/violation.entity';
import { DataSource, In, Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

@Injectable()
export class ExamService {
  private readonly logger = new Logger(ExamService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
    @InjectRepository(ExamAttempt)
    private readonly attemptRepository: Repository<ExamAttempt>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Violation)
    private readonly violationRepository: Repository<Violation>,
  ) { }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      totalExams,
      totalQuestions,
      totalAttempts,
      attemptsByStatus,
      topExamsRaw,
      timelineRaw,
      totalViolations,
      violationsByType,
    ] = await Promise.all([
      this.userRepository.count({ where: { deletedAt: null as any } }),
      this.examRepository.count({ where: { deletedAt: null as any } }),
      this.questionRepository.count({ where: { deletedAt: null as any } }),
      this.attemptRepository.count(),
      this.getAttemptsByStatus(),
      this.getTopExams(),
      this.getAttemptsTimeline(),
      this.violationRepository.count(),
      this.getViolationsByType(),
    ]);

    return {
      overview: { totalUsers, totalExams, totalQuestions, totalAttempts },
      attemptsByStatus: attemptsByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      topExams: topExamsRaw.map((r) => ({
        examId: Number(r.examId),
        examTitle: r.examTitle,
        attemptCount: Number(r.attemptCount),
      })),
      attemptsTimeline: this.fillTimelineGaps(timelineRaw),
      violations: {
        totalViolations,
        byType: violationsByType.map((r) => ({
          type: r.type,
          count: Number(r.count),
        })),
      },
    };
  }

  // ─── Public / User-facing ─────────────────────────────────────────────────

  async getAvailableExams(userId: number) {
    const exams = await this.examRepository
      .createQueryBuilder('exam')
      .leftJoin('exam.assignedUsers', 'assignedUser')
      .where('exam.deletedAt IS NULL')
      .andWhere('exam.startDate <= :now', { now: new Date() })
      .andWhere('(exam.isPublic = true OR assignedUser.id = :userId)', { userId })
      // Chỉ loại exam nếu attempt MỚI NHẤT của user đang ở trạng thái cuối
      // (submitted / violated / terminated). Nếu admin đã "cho thi lại" thì
      // attempt mới nhất sẽ là initialized → exam xuất hiện lại.
      .andWhere(`
        NOT EXISTS (
          SELECT 1 FROM exam_attempts a
          WHERE a.exam_id = exam.id
            AND a.user_id = :userId
            AND a.status NOT IN (:...allowedStatuses)
            AND a.attempt_no = (
              SELECT MAX(a2.attempt_no)
              FROM exam_attempts a2
              WHERE a2.exam_id = exam.id
                AND a2.user_id = :userId
            )
        )
      `, {
        userId,
        allowedStatuses: [AttemptStatus.INITIALIZED, AttemptStatus.ACTIVE],
      })
      .orderBy('exam.startDate', 'DESC')
      .getMany();

    return exams.map((exam) => this.toResponse(exam));
  }

  async getUserAttempts(userId: number) {
    const attempts = await this.attemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.exam', 'exam')
      .where('attempt.userId = :userId', { userId })
      .andWhere('exam.deletedAt IS NULL')
      .orderBy('attempt.createdAt', 'DESC')
      .getMany();

    return attempts.map((attempt) => ({
      id: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.exam?.title ?? `Exam #${attempt.examId}`,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      endedAt: attempt.endedAt,
      createdAt: attempt.createdAt,
    }));
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateExamDto) {
    const exam = this.examRepository.create({
      title: dto.title,
      description: dto.description?.trim() || null,
      duration: dto.duration,
      startDate: dto.startDate,
      isPublic: dto.isPublic ?? false,
    });

    const saved = await this.examRepository.save(exam);
    this.logger.log(`Exam created: id=${saved.id}`);
    return this.toResponse(saved);
  }

  async findAll(query: ExamQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.examRepository
      .createQueryBuilder('exam')
      .where('exam.deletedAt IS NULL');

    if (search) {
      qb.andWhere(
        '(exam.title LIKE :s OR exam.description LIKE :s OR CAST(exam.id AS CHAR) LIKE :s)',
        { s: `%${search}%` },
      );
    }

    const [items, totalItems] = await qb
      .orderBy('exam.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((e) => this.toResponse(e)),
      meta: this.buildMeta(page, limit, totalItems),
    };
  }

  async findOne(id: number) {
    return this.toResponse(await this.findExamOrThrow(id));
  }

  async update(id: number, dto: UpdateExamDto) {
    const exam = await this.findExamOrThrow(id);

    if (dto.title !== undefined) exam.title = dto.title;
    if (dto.description !== undefined) exam.description = dto.description?.trim() || null;
    if (dto.duration !== undefined) exam.duration = dto.duration;
    if (dto.startDate !== undefined) exam.startDate = dto.startDate;
    if (dto.isPublic !== undefined) exam.isPublic = dto.isPublic;

    const saved = await this.examRepository.save(exam);
    this.logger.log(`Exam updated: id=${id}`);
    return this.toResponse(saved);
  }

  async remove(id: number) {
    await this.findExamOrThrow(id);

    await this.dataSource.transaction(async (manager) => {
      const examRepo = manager.getRepository(Exam);

      // Clear ManyToMany junction (exam_user_assignments) — no DB cascade on this
      const exam = await examRepo.findOne({ where: { id }, relations: ['assignedUsers'] });
      if (exam) {
        exam.assignedUsers = [];
        await examRepo.save(exam);
      }

      // Hard delete — triggers ON DELETE CASCADE for questions, attempts, violations
      await examRepo.delete(id);
    });

    this.logger.log(`Exam deleted: id=${id}`);
    return { message: 'Exam deleted successfully' };
  }

  // ─── Admin: Exam History ─────────────────────────────────────────────────

  async getExamHistory(examId: number, search?: string) {
    await this.findExamOrThrow(examId);

    const qb = this.attemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.user', 'user')
      .leftJoinAndSelect('attempt.violations', 'violations')
      .where('attempt.examId = :examId', { examId });

    if (search?.trim()) {
      qb.andWhere(
        '(user.fullName LIKE :s OR user.userName LIKE :s)',
        { s: `%${search.trim()}%` },
      );
    }

    const attempts = await qb
      .orderBy('attempt.createdAt', 'DESC')
      .addOrderBy('violations.createdAt', 'DESC')
      .getMany();

    return attempts.map((attempt) => ({
      id: attempt.id,
      attemptNo: attempt.attemptNo,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      endedAt: attempt.endedAt,
      createdAt: attempt.createdAt,
      user: {
        id: attempt.user?.id ?? attempt.userId,
        userName: attempt.user?.userName ?? '',
        fullName: attempt.user?.fullName ?? '',
      },
      violations: (attempt.violations ?? []).map((v) => ({
        id: v.id,
        type: v.type,
        metadata: v.metadata,
        createdAt: v.createdAt,
      })),
    }));
  }

  // ─── User Assignment ──────────────────────────────────────────────────────

  async getAssignedUsers(examId: number) {
    const exam = await this.examRepository.findOne({
      where: { id: examId },
      relations: ['assignedUsers'],
    });

    if (!exam) throw new NotFoundException(`Exam with id ${examId} not found`);

    return exam.assignedUsers.map((u) => ({
      id: u.id,
      userName: u.userName,
      fullName: u.fullName,
      status: u.status,
    }));
  }

  async assignUsers(examId: number, userIds: number[]) {
    const users = await this.userRepository.find({ where: { id: In(userIds) } });

    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    await this.dataSource.transaction(async (manager) => {
      const examRepo = manager.getRepository(Exam);

      const exam = await examRepo.findOne({ where: { id: examId }, relations: ['assignedUsers'] });
      if (!exam) throw new NotFoundException(`Exam with id ${examId} not found`);

      const existingIds = new Set(exam.assignedUsers.map((u) => u.id));
      const newUsers = users.filter((u) => !existingIds.has(u.id));
      exam.assignedUsers = [...exam.assignedUsers, ...newUsers];

      await examRepo.save(exam);
    });

    this.logger.log(`Assigned ${users.length} users to exam id=${examId}`);
    return { message: 'Users assigned successfully', count: users.length };
  }

  async unassignUser(examId: number, userId: number) {
    await this.dataSource.transaction(async (manager) => {
      const examRepo = manager.getRepository(Exam);

      const exam = await examRepo.findOne({ where: { id: examId }, relations: ['assignedUsers'] });
      if (!exam) throw new NotFoundException(`Exam with id ${examId} not found`);

      exam.assignedUsers = exam.assignedUsers.filter((u) => u.id !== userId);
      await examRepo.save(exam);
    });

    this.logger.log(`Unassigned user id=${userId} from exam id=${examId}`);
    return { message: 'User unassigned successfully' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findExamOrThrow(id: number): Promise<Exam> {
    const exam = await this.examRepository.findOne({ where: { id } });
    if (!exam) throw new NotFoundException(`Exam with id ${id} not found`);
    return exam;
  }

  private buildMeta(page: number, limit: number, totalItems: number) {
    return {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      hasNextPage: page * limit < totalItems,
      hasPreviousPage: page > 1,
    };
  }

  private toResponse(exam: Exam) {
    return {
      id: exam.id,
      title: exam.title,
      description: exam.description ?? null,
      duration: exam.duration,
      startDate: exam.startDate,
      isPublic: exam.isPublic,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
      deletedAt: exam.deletedAt,
    };
  }

  // ─── Dashboard query helpers ──────────────────────────────────────────────

  private getAttemptsByStatus() {
    return this.attemptRepository
      .createQueryBuilder('a')
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.status')
      .getRawMany<{ status: string; count: string }>();
  }

  private getTopExams() {
    return this.attemptRepository
      .createQueryBuilder('a')
      .leftJoin('a.exam', 'exam')
      .select('a.examId', 'examId')
      .addSelect('exam.title', 'examTitle')
      .addSelect('COUNT(*)', 'attemptCount')
      .where('exam.deletedAt IS NULL')
      .groupBy('a.examId')
      .addGroupBy('exam.title')
      .orderBy('attemptCount', 'DESC')
      .limit(5)
      .getRawMany<{ examId: string; examTitle: string; attemptCount: string }>();
  }

  private getAttemptsTimeline() {
    return this.attemptRepository
      .createQueryBuilder('a')
      .select("DATE_FORMAT(a.createdAt, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('a.createdAt >= :from', {
        from: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
      })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; count: string }>();
  }

  private getViolationsByType() {
    return this.violationRepository
      .createQueryBuilder('v')
      .select('v.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('v.type')
      .orderBy('count', 'DESC')
      .limit(6)
      .getRawMany<{ type: string; count: string }>();
  }

  private fillTimelineGaps(raw: { date: string; count: string }[]) {
    const map = new Map(raw.map((r) => [r.date, Number(r.count)]));
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: map.get(key) ?? 0 };
    });
  }
}
