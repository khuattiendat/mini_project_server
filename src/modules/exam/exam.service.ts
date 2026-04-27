import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Exam } from 'src/database/entities/exam.entity';
import { ExamAttempt } from 'src/database/entities/examAttempt.entity';
import { Question } from 'src/database/entities/question.entity';
import { User } from 'src/database/entities/user.entity';
import { Violation } from 'src/database/entities/violation.entity';
import { In, Repository } from 'typeorm';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamQueryDto } from './dto/exam-query.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

@Injectable()
export class ExamService {
  constructor(
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
  ) {}

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
      // Overview counts
      this.userRepository.count({ where: { deletedAt: null as any } }),
      this.examRepository.count({ where: { deletedAt: null as any } }),
      this.questionRepository.count({ where: { deletedAt: null as any } }),
      this.attemptRepository.count(),

      // Attempts by status
      this.attemptRepository
        .createQueryBuilder('a')
        .select('a.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('a.status')
        .getRawMany<{ status: string; count: string }>(),

      // Top 5 exams by attempt count
      this.attemptRepository
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
        .getRawMany<{ examId: string; examTitle: string; attemptCount: string }>(),

      // Attempts per day — last 14 days
      this.attemptRepository
        .createQueryBuilder('a')
        .select("DATE_FORMAT(a.createdAt, '%Y-%m-%d')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('a.createdAt >= :from', {
          from: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
        })
        .groupBy('date')
        .orderBy('date', 'ASC')
        .getRawMany<{ date: string; count: string }>(),

      // Violations total
      this.violationRepository.count(),

      // Violations by type
      this.violationRepository
        .createQueryBuilder('v')
        .select('v.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('v.type')
        .orderBy('count', 'DESC')
        .limit(6)
        .getRawMany<{ type: string; count: string }>(),
    ]);

    // Fill missing days in timeline
    const timelineMap = new Map(timelineRaw.map((r) => [r.date, Number(r.count)]));
    const timeline: Array<{ date: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      timeline.push({ date: key, count: timelineMap.get(key) ?? 0 });
    }

    return {
      overview: {
        totalUsers,
        totalExams,
        totalQuestions,
        totalAttempts,
      },
      attemptsByStatus: attemptsByStatus.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
      topExams: topExamsRaw.map((r) => ({
        examId: Number(r.examId),
        examTitle: r.examTitle,
        attemptCount: Number(r.attemptCount),
      })),
      attemptsTimeline: timeline,
      violations: {
        totalViolations,
        byType: violationsByType.map((r) => ({
          type: r.type,
          count: Number(r.count),
        })),
      },
    };
  }

  async getAvailableExams(userId: number) {
    const now = new Date();

    // Get public exams + exams assigned to this user, both with startDate <= now
    const exams = await this.examRepository
      .createQueryBuilder('exam')
      .leftJoin('exam.assignedUsers', 'assignedUser')
      .where('exam.deletedAt IS NULL')
      .andWhere('exam.startDate <= :now', { now })
      .andWhere(
        '(exam.isPublic = true OR assignedUser.id = :userId)',
        { userId },
      )
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

  async create(createExamDto: CreateExamDto) {
    const exam = this.examRepository.create({
      title: createExamDto.title,
      description: createExamDto.description?.trim() || null,
      duration: createExamDto.duration,
      startDate: createExamDto.startDate,
      isPublic: createExamDto.isPublic ?? false,
    });

    const savedExam = await this.examRepository.save(exam);

    return this.toResponse(savedExam);
  }

  async findAll(query: ExamQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.examRepository.createQueryBuilder('exam');

    qb.andWhere('exam.deletedAt IS NULL');

    if (search) {
      const searchTerm = `%${search}%`;

      qb.andWhere(
        '(exam.title LIKE :searchTerm OR exam.description LIKE :searchTerm OR CAST(exam.id AS CHAR) LIKE :searchTerm)',
        { searchTerm },
      );
    }

    const [items, totalItems] = await qb
      .orderBy('exam.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((exam) => this.toResponse(exam)),
      meta: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        hasNextPage: page * limit < totalItems,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: number) {
    const exam = await this.findExamOrThrow(id);

    return this.toResponse(exam);
  }

  async update(id: number, updateExamDto: UpdateExamDto) {
    const exam = await this.findExamOrThrow(id);

    if (updateExamDto.title !== undefined) {
      exam.title = updateExamDto.title;
    }

    if (updateExamDto.description !== undefined) {
      exam.description = updateExamDto.description?.trim() || null;
    }

    if (updateExamDto.duration !== undefined) {
      exam.duration = updateExamDto.duration;
    }

    if (updateExamDto.startDate !== undefined) {
      exam.startDate = updateExamDto.startDate;
    }

    if (updateExamDto.isPublic !== undefined) {
      exam.isPublic = updateExamDto.isPublic;
    }

    const savedExam = await this.examRepository.save(exam);

    return this.toResponse(savedExam);
  }

  async remove(id: number) {
    await this.findExamOrThrow(id);

    await this.examRepository.softDelete(id);

    return {
      message: 'Exam deleted successfully',
    };
  }

  async getAssignedUsers(examId: number) {
    const exam = await this.examRepository.findOne({
      where: { id: examId },
      relations: ['assignedUsers'],
    });

    if (!exam) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    return (exam.assignedUsers ?? []).map((u) => ({
      id: u.id,
      userName: u.userName,
      fullName: u.fullName,
      status: u.status,
    }));
  }

  async assignUsers(examId: number, userIds: number[]) {
    const exam = await this.examRepository.findOne({
      where: { id: examId },
      relations: ['assignedUsers'],
    });

    if (!exam) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    const users = await this.userRepository.find({
      where: { id: In(userIds) },
    });

    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    const existingIds = new Set((exam.assignedUsers ?? []).map((u) => u.id));
    const newUsers = users.filter((u) => !existingIds.has(u.id));
    exam.assignedUsers = [...(exam.assignedUsers ?? []), ...newUsers];
    await this.examRepository.save(exam);

    return { message: 'Users assigned successfully', count: users.length };
  }

  async unassignUser(examId: number, userId: number) {
    const exam = await this.examRepository.findOne({
      where: { id: examId },
      relations: ['assignedUsers'],
    });

    if (!exam) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    exam.assignedUsers = (exam.assignedUsers ?? []).filter(
      (u) => u.id !== userId,
    );
    await this.examRepository.save(exam);

    return { message: 'User unassigned successfully' };
  }

  private async findExamOrThrow(id: number): Promise<Exam> {
    const exam = await this.examRepository.findOne({ where: { id } });

    if (!exam) {
      throw new NotFoundException(`Exam with id ${id} not found`);
    }

    return exam;
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
}
