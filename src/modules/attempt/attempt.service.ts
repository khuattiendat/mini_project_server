import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AttemptStatus,
  ExamAttempt,
} from 'src/database/entities/examAttempt.entity';
import { Choice } from 'src/database/entities/choice.entity';
import { Exam } from 'src/database/entities/exam.entity';
import { Question } from 'src/database/entities/question.entity';
import { UserAnswer } from 'src/database/entities/userAnswer.entity';
import { DataSource, Repository } from 'typeorm';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import {
  AttemptAlreadySubmittedException,
  AttemptTerminatedException,
  AttemptViolatedException,
  ExamNotAvailableException,
  SubmitConflictException,
} from 'src/common/exceptions/attempt.exception';
import {
  ViolationService,
  ViolationType,
} from '../violation/violation.service';
import { RedisService } from '../redis/redis.service';
import {
  ATTEMPT_SESSION_TTL,
  VIOLATION_BUFFER_TTL,
  REDIS_KEYS,
} from 'src/common/constants/redis.constants';

// Shape lưu trong Redis
interface AttemptSession {
  status: AttemptStatus;
  deviceId: string | null;
  lastPingAt: string; // ISO string
}

@Injectable()
export class AttemptService {
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly violationService: ViolationService,
    private readonly redisService: RedisService,
    @InjectRepository(ExamAttempt)
    private readonly attemptRepository: Repository<ExamAttempt>,
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(Choice)
    private readonly choiceRepository: Repository<Choice>,
  ) { }

  // ─── Redis session helpers ────────────────────────────────────────────────

  /**
   * Ghi session vào Redis. Gọi sau mọi thay đổi status.
   */
  private async syncSession(attempt: ExamAttempt): Promise<void> {
    const key = REDIS_KEYS.attemptSession(attempt.id);
    const session: AttemptSession = {
      status: attempt.status,
      deviceId: attempt.deviceId,
      lastPingAt: new Date().toISOString(),
    };
    await this.redisService.setJson(key, session, ATTEMPT_SESSION_TTL);
  }

  // ─── Start attempt ────────────────────────────────────────────────────────

  async startAttempt(userId: number, dto: StartAttemptDto) {
    const lockKey = REDIS_KEYS.startLock(userId, dto.examId);
    const acquired = await this.redisService.acquireLock(lockKey, 120);
    if (!acquired) throw new SubmitConflictException();

    try {
      return await this._startAttempt(userId, dto);
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  private async _startAttempt(userId: number, dto: StartAttemptDto) {
    const deviceId = dto.device_id;
    const exam = await this.examRepository
      .createQueryBuilder('exam')
      .leftJoin('exam.assignedUsers', 'assignedUser')
      .where('exam.id = :id', { id: dto.examId })
      .andWhere('exam.deletedAt IS NULL')
      .andWhere('exam.startDate <= :now', { now: new Date() })
      .andWhere('(exam.isPublic = true OR assignedUser.id = :userId)', {
        userId,
      })
      .getOne();

    if (!exam) throw new ExamNotAvailableException();

    let attempt: ExamAttempt;
    try {
      attempt = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ExamAttempt);

        const lastAttempt = await repo
          .createQueryBuilder('a')
          .where('a.userId = :userId AND a.examId = :examId', {
            userId,
            examId: dto.examId,
          })
          .orderBy('a.attemptNo', 'DESC')
          .setLock('pessimistic_write')
          .getOne();

        if (lastAttempt) {
          if (lastAttempt.deviceId && lastAttempt.deviceId !== deviceId) {
            this.logger.warn(
              `Device mismatch on start: userId=${userId}, examId=${dto.examId}, attemptId=${lastAttempt.id}`,
            );
            throw Object.assign(new AttemptViolatedException(), {
              _violatedAttemptId: lastAttempt.id,
            });
          }

          this.assertAttemptAllowed(lastAttempt.status);

          if (lastAttempt.status === AttemptStatus.INITIALIZED) {
            lastAttempt.startedAt = new Date();
            if (!lastAttempt.deviceId && deviceId) {
              lastAttempt.deviceId = deviceId;
            }
            return repo.save(lastAttempt);
          }
          if (lastAttempt.status === AttemptStatus.ACTIVE) {
            return lastAttempt;
          }
        }

        const attemptNo = lastAttempt ? lastAttempt.attemptNo + 1 : 1;
        const created = repo.create({
          userId,
          examId: dto.examId,
          attemptNo,
          status: AttemptStatus.INITIALIZED,
          deviceId,
          startedAt: new Date(),
        });
        return repo.save(created);
      });
    } catch (err: any) {
      if (err._violatedAttemptId) {
        await this.attemptRepository.update(err._violatedAttemptId, {
          status: AttemptStatus.VIOLATED,
        });
        // Sync Redis với status mới
        const violated = await this.attemptRepository.findOne({
          where: { id: err._violatedAttemptId },
        });
        if (violated) await this.syncSession(violated);

        await this.violationService.logViolation({
          attemptId: err._violatedAttemptId,
          userId,
          type: ViolationType.DEVICE_MISMATCH,
          message: 'Phát hiện đăng nhập từ thiết bị khác khi bắt đầu bài thi.',
        });
      }
      throw err;
    }

    // Sync session sau khi start thành công
    await this.syncSession(attempt);

    this.logger.log(
      `Attempt started: userId=${userId}, examId=${dto.examId}, attemptNo=${attempt.attemptNo}`,
    );

    return this.buildAttemptResponse(attempt, exam);
  }

  // ─── Get attempt by exam (vào trang làm bài) ─────────────────────────────

  async getAttemptByExam(userId: number, examId: number, deviceId: string) {
    const attempt = await this.attemptRepository.findOne({
      where: { examId, userId },
      order: { attemptNo: 'DESC' },
    });

    if (!attempt) throw new NotFoundException('Attempt not found');

    if (attempt.deviceId && attempt.deviceId !== deviceId) {
      this.logger.warn(
        `Device mismatch on load: userId=${userId}, examId=${examId}, attemptId=${attempt.id}`,
      );
      attempt.status = AttemptStatus.VIOLATED;
      await this.attemptRepository.save(attempt);
      await this.syncSession(attempt); // sync Redis
      await this.violationService.logViolation({
        attemptId: attempt.id,
        userId,
        type: ViolationType.DEVICE_MISMATCH,
        message: 'Phát hiện đăng nhập từ thiết bị khác khi vào trang làm bài.',
      });
      throw new AttemptViolatedException();
    }

    this.assertAttemptAllowed(attempt.status);

    // Chỉ set startedAt lần đầu tiên (khi chưa có hoặc status chưa ACTIVE)
    // Các lần reload sau giữ nguyên startedAt để tính đúng thời gian đã làm
    if (attempt.status !== AttemptStatus.ACTIVE || !attempt.startedAt) {
      attempt.startedAt = new Date();
    }
    attempt.status = AttemptStatus.ACTIVE;
    await this.attemptRepository.save(attempt);
    await this.syncSession(attempt);

    const exam = await this.examRepository.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.buildAttemptResponse(attempt, exam);
  }


  async pingAttempt(userId: number, attemptId: number, deviceId: string) {
    const key = REDIS_KEYS.attemptSession(attemptId);

    // Đọc từ Redis trước (cache-first)
    let session = await this.redisService.getJson<AttemptSession>(key);

    if (!session) {
      // Cache miss → fallback DB, warm cache
      const attempt = await this.attemptRepository.findOne({
        where: { id: attemptId, userId },
      });
      if (!attempt) throw new NotFoundException('Attempt not found');
      await this.syncSession(attempt);
      session = {
        status: attempt.status,
        deviceId: attempt.deviceId,
        lastPingAt: new Date().toISOString(),
      };
    }

    const ALLOWED = [AttemptStatus.ACTIVE, AttemptStatus.INITIALIZED];

    // Phát hiện device mismatch → khóa ngay, bất kể status
    if (session.deviceId && session.deviceId !== deviceId) {
      this.logger.warn(
        `[PING] Device mismatch: userId=${userId}, attemptId=${attemptId}`,
      );
      await this.attemptRepository.update(attemptId, {
        status: AttemptStatus.VIOLATED,
      });
      session.status = AttemptStatus.VIOLATED;
      session.lastPingAt = new Date().toISOString();
      await this.redisService.setJson(key, session, ATTEMPT_SESSION_TTL);

      await this.violationService.logViolation({
        attemptId,
        userId,
        type: ViolationType.DEVICE_MISMATCH,
        message: 'Phát hiện đăng nhập từ thiết bị khác trong quá trình làm bài.',
      });

      // Flush buffer vi phạm xuống DB
      await this.violationService.flushViolationBuffer(attemptId);

      return {
        status: AttemptStatus.VIOLATED,
        locked: true,
        message: 'Bài thi đã bị khóa do phát hiện đăng nhập từ thiết bị khác.',
      };
    }

    // Whitelist: chỉ ACTIVE/INITIALIZED mới được tiếp tục
    if (!ALLOWED.includes(session.status)) {
      const messages: Partial<Record<AttemptStatus, string>> = {
        [AttemptStatus.SUBMITTED]: 'Bài thi của bạn đã được nộp thành công.',
        [AttemptStatus.VIOLATED]:
          'Bài thi đã bị khóa do vi phạm quy chế. Vui lòng liên hệ giám thị để được hỗ trợ.',
        [AttemptStatus.TERMINATED]:
          'Lượt thi của bạn đã bị kết thúc bởi giám thị. Vui lòng liên hệ giám thị để biết thêm chi tiết.',
      };
      return {
        status: session.status,
        locked: true,
        message: messages[session.status] ?? 'Bài thi không hợp lệ.',
      };
    }

    // Hợp lệ → refresh TTL cho cả session lẫn violation buffer
    session.lastPingAt = new Date().toISOString();
    await this.redisService.setJson(key, session, ATTEMPT_SESSION_TTL);

    // Gia hạn TTL violation buffer về 24h — đảm bảo buffer không hết hạn
    // trong suốt thời gian bài thi còn active (dù không có vi phạm mới)
    const bufferKey = REDIS_KEYS.violationBuffer(attemptId);
    const bufferExists = await this.redisService.exists(bufferKey);
    if (bufferExists) {
      await this.redisService.expire(bufferKey, VIOLATION_BUFFER_TTL);
    }

    return { status: session.status, locked: false };
  }

  async submitAttempt(
    userId: number,
    attemptId: number,
    dto: SubmitAttemptDto,
  ) {
    const lockKey = REDIS_KEYS.submitLock(attemptId);
    // Cố gắng acquire submit lock trong 120 giây
    const acquired = await this.redisService.acquireLock(lockKey, 120);
    if (!acquired) throw new SubmitConflictException();

    try {
      const result = await this.dataSource.transaction(async (manager) => {
        const attemptRepo = manager.getRepository(ExamAttempt);
        const answerRepo = manager.getRepository(UserAnswer);

        const attempt = await attemptRepo
          .createQueryBuilder('a')
          .where('a.id = :id AND a.userId = :userId', { id: attemptId, userId })
          .setLock('pessimistic_write')
          .getOne();

        if (!attempt) throw new NotFoundException('Attempt not found');

        this.assertAttemptAllowed(attempt.status);

        const questionIds = dto.answers.map((a) => a.questionId);
        const choiceIds = dto.answers.map((a) => a.selectedChoiceId);

        // Lấy tổng số câu hỏi của đề (để tính điểm đúng)
        const allExamQuestions = await this.questionRepository
          .createQueryBuilder('q')
          .where('q.examId = :examId', { examId: attempt.examId })
          .andWhere('q.deletedAt IS NULL')
          .getMany();

        await answerRepo.delete({ attemptId });

        let correctCount = 0;
        const answersToSave: Partial<UserAnswer>[] = [];

        // Chỉ validate nếu có câu trả lời
        if (questionIds.length > 0) {
          const validQuestions = await this.questionRepository
            .createQueryBuilder('q')
            .where('q.id IN (:...ids)', { ids: questionIds })
            .andWhere('q.examId = :examId', { examId: attempt.examId })
            .getMany();

          const validQuestionIds = new Set(validQuestions.map((q) => q.id));

          const choices = await this.choiceRepository
            .createQueryBuilder('c')
            .where('c.id IN (:...ids)', { ids: choiceIds })
            .getMany();

          const choiceMap = new Map(choices.map((c) => [c.id, c]));

          for (const ans of dto.answers) {
            if (!validQuestionIds.has(ans.questionId)) continue;
            const choice = choiceMap.get(ans.selectedChoiceId);
            if (!choice || choice.questionId !== ans.questionId) continue;
            if (choice.isCorrect) correctCount++;
            answersToSave.push({
              attemptId,
              questionId: ans.questionId,
              selectedChoiceId: ans.selectedChoiceId,
              isCorrect: choice.isCorrect,
            });
          }

          await answerRepo.save(answersToSave);
        }

        attempt.status = AttemptStatus.SUBMITTED;
        attempt.submittedAt = new Date();
        await attemptRepo.save(attempt);

        return {
          savedAttempt: attempt,
          score: {
            attemptId,
            totalQuestions: allExamQuestions.length,
            answeredQuestions: answersToSave.length,
            correctAnswers: correctCount,
            score:
              allExamQuestions.length > 0
                ? Math.round((correctCount / allExamQuestions.length) * 100)
                : 0,
          },
        };
      });

      // Sync Redis sau khi transaction commit
      await this.syncSession(result.savedAttempt);
      // Flush toàn bộ buffer vi phạm xuống DB
      await this.violationService.flushViolationBuffer(attemptId);
      // Bug 3 fix: bỏ del(submitLock) thừa — releaseLock trong finally đã xử lý

      this.logger.log(
        `Attempt submitted: attemptId=${attemptId}, userId=${userId}, score=${result.score.score}`,
      );
      return result.score;
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  // ─── Admin: Reset attempt (cho thi lại) ──────────────────────────────────

  async adminResetAttempt(examId: number, userId: number) {
    const newAttempt = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ExamAttempt);

      // Pessimistic write lock — đọc attempt mới nhất, chặn concurrent writes
      const last = await repo
        .createQueryBuilder('a')
        .where('a.userId = :userId AND a.examId = :examId', { userId, examId })
        .orderBy('a.attemptNo', 'DESC')
        .setLock('pessimistic_write')
        .getOne();

      // Nếu attempt mới nhất đang INITIALIZED/ACTIVE → không cần tạo mới
      if (
        last &&
        (last.status === AttemptStatus.INITIALIZED ||
          last.status === AttemptStatus.ACTIVE)
      ) {
        return last;
      }

      // Clone từ attempt cũ: giữ deviceId để user không bị device mismatch
      // Reset các field thời gian và status về trạng thái ban đầu
      const created = repo.create({
        userId,
        examId,
        attemptNo: last ? last.attemptNo + 1 : 1,
        status: AttemptStatus.INITIALIZED,
        deviceId: null,
        startedAt: null,
        submittedAt: null,
        endedAt: null,
      });
      return repo.save(created);
    });


    this.logger.log(
      `Admin reset attempt: userId=${userId}, examId=${examId}, newAttemptId=${newAttempt.id}, attemptNo=${newAttempt.attemptNo}`,
    );

    return {
      id: newAttempt.id,
      attemptNo: newAttempt.attemptNo,
      status: newAttempt.status,
    };
  }

  // ─── Admin: Terminate attempt (cấm thi) ──────────────────────────────────

  async adminTerminateAttempt(attemptId: number) {
    // Dùng submitLock để tránh race với user đang submit cùng lúc
    const lockKey = REDIS_KEYS.submitLock(attemptId);
    const acquired = await this.redisService.acquireLock(lockKey, 30);
    if (!acquired) throw new SubmitConflictException();

    try {
      const attempt = await this.dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(ExamAttempt);

        const found = await repo
          .createQueryBuilder('a')
          .where('a.id = :id', { id: attemptId })
          .setLock('pessimistic_write')
          .getOne();

        if (!found) throw new NotFoundException('Attempt not found');

        // Idempotent: đã terminated rồi thì trả về luôn
        if (found.status === AttemptStatus.TERMINATED) return found;

        found.status = AttemptStatus.TERMINATED;
        found.endedAt = new Date();
        return repo.save(found);
      });

      // Sync Redis ngay sau transaction — ghi đè bất kỳ session cũ nào
      await this.syncSession(attempt);
      // Flush buffer vi phạm xuống DB
      await this.violationService.flushViolationBuffer(attempt.id);

      this.logger.warn(
        `Admin terminated attempt: attemptId=${attemptId}, userId=${attempt.userId}`,
      );

      return { id: attempt.id, status: attempt.status };
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  // ─── Other getters ────────────────────────────────────────────────────────

  // ─── Lock attempt (client-side violation) ─────────────────────────────────

  async lockAttempt(
    userId: number,
    attemptId: number,
    violationType: ViolationType,
    message: string,
  ) {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    // Chỉ lock nếu đang ACTIVE/INITIALIZED — bỏ qua nếu đã ở trạng thái cuối
    if (
      attempt.status === AttemptStatus.SUBMITTED ||
      attempt.status === AttemptStatus.VIOLATED ||
      attempt.status === AttemptStatus.TERMINATED
    ) {
      return { locked: true, status: attempt.status };
    }

    attempt.status = AttemptStatus.VIOLATED;
    await this.attemptRepository.save(attempt);

    // Sync Redis ngay lập tức
    await this.syncSession(attempt);

    // Flush toàn bộ buffer vi phạm xuống DB trước khi ghi vi phạm cuối
    await this.violationService.flushViolationBuffer(attemptId);

    // Ghi vi phạm lock cuối cùng trực tiếp vào DB (không qua buffer)
    await this.violationService.logViolation({
      attemptId,
      userId,
      type: violationType,
      message,
      metadata: { source: 'client' },
    });

    this.logger.warn(
      `Attempt locked by client: attemptId=${attemptId}, userId=${userId}, type=${violationType}`,
    );

    return { locked: true, status: AttemptStatus.VIOLATED };
  }

  // ─── Log violation only (buffer vào Redis, không ghi DB ngay) ───────────

  /**
   * Đẩy vi phạm vào Redis buffer — không thay đổi status, không ghi DB.
   * Buffer sẽ được flush xuống DB khi bài thi kết thúc.
   * Vẫn chấp nhận ngay cả khi attempt đã SUBMITTED/VIOLATED/TERMINATED
   * để không mất log trong edge case.
   */
  async logViolationOnly(
    userId: number,
    attemptId: number,
    violationType: ViolationType,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<{ violationId: number }> {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    const result = await this.violationService.bufferViolation({
      attemptId,
      type: violationType,
      message,
      metadata,
    });

    this.logger.log(
      `Violation buffered: attemptId=${attemptId}, userId=${userId}, type=${violationType}, bufferIndex=${result.violationId}`,
    );

    return result;
  }

  /**
   * Đánh dấu vi phạm trong Redis buffer là đã resolved.
   * violationId ở đây là bufferIndex trả về từ logViolationOnly.
   */
  async resolveViolation(
    userId: number,
    attemptId: number,
    violationId: number,
  ): Promise<void> {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    await this.violationService.resolveBufferedViolation(attemptId, violationId);
  }

  async getAttemptDetail(userId: number, attemptId: number) {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');
    this.assertAttemptAllowed(attempt.status);

    const exam = await this.examRepository.findOne({
      where: { id: attempt.examId },
    });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.buildAttemptResponse(attempt, exam);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private assertAttemptAllowed(status: AttemptStatus) {
    if (status === AttemptStatus.VIOLATED) throw new AttemptViolatedException();
    if (status === AttemptStatus.SUBMITTED)
      throw new AttemptAlreadySubmittedException();
    if (status === AttemptStatus.TERMINATED)
      throw new AttemptTerminatedException();
  }

  private async buildAttemptResponse(attempt: ExamAttempt, exam: Exam) {
    const questions = await this.questionRepository
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.choices', 'choices')
      .where('q.examId = :examId', { examId: exam.id })
      .andWhere('q.deletedAt IS NULL')
      .orderBy('q.orderIndex', 'ASC')
      .getMany();

    return {
      attempt: {
        id: attempt.id,
        examId: attempt.examId,
        attemptNo: attempt.attemptNo,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description ?? null,
        duration: exam.duration,
      },
      questions: questions.map((q) => ({
        id: q.id,
        content: q.content,
        orderIndex: q.orderIndex,
        choices: q.choices.map((c) => ({
          id: c.id,
          content: c.content,
        })),
      })),
    };
  }
}
