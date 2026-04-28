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
import { ViolationService, ViolationType } from '../violation/violation.service';
import { RedisService } from '../redis/redis.service';
import {
  ATTEMPT_SESSION_TTL,
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

  /**
   * Đọc session từ Redis. Nếu miss → load từ DB rồi warm cache.
   */
  private async loadSession(
    attemptId: number,
    userId: number,
  ): Promise<{ session: AttemptSession; attempt: ExamAttempt }> {
    const key = REDIS_KEYS.attemptSession(attemptId);
    const cached = await this.redisService.getJson<AttemptSession>(key);

    if (cached) {
      // Trả về session từ cache, kèm attempt stub (chỉ cần id + userId để validate)
      const attempt = { id: attemptId, userId } as ExamAttempt;
      return { session: cached, attempt };
    }

    // Cache miss → fallback DB
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId, userId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found');

    // Warm cache
    await this.syncSession(attempt);

    const session: AttemptSession = {
      status: attempt.status,
      deviceId: attempt.deviceId,
      lastPingAt: new Date().toISOString(),
    };
    return { session, attempt };
  }

  // ─── Start attempt ────────────────────────────────────────────────────────

  async startAttempt(userId: number, dto: StartAttemptDto) {
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
          message: 'Thiết bị không khớp khi bắt đầu bài thi. Đã khóa attempt.',
          metadata: { examId: dto.examId, receivedDeviceId: dto.device_id },
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
        message: 'Thiết bị không khớp khi vào trang làm bài. Đã khóa attempt.',
        metadata: { examId, receivedDeviceId: deviceId },
      });
      throw new AttemptViolatedException();
    }

    this.assertAttemptAllowed(attempt.status);

    // Reset startedAt mỗi khi user thực sự vào trang làm bài
    // → đảm bảo thời gian đếm ngược tính từ lúc bắt đầu làm, không phải lúc tạo attempt
    attempt.status = AttemptStatus.ACTIVE;
    attempt.startedAt = new Date();
    await this.attemptRepository.save(attempt);
    await this.syncSession(attempt);

    const exam = await this.examRepository.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Exam not found');

    return this.buildAttemptResponse(attempt, exam);
  }

  // ─── Ping ─────────────────────────────────────────────────────────────────

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
        message: 'Phát hiện thiết bị khác nhau trong quá trình làm bài (ping).',
        metadata: { receivedDeviceId: deviceId },
      });

      return {
        status: AttemptStatus.VIOLATED,
        locked: true,
        message: 'Phát hiện thiết bị không hợp lệ. Bài thi đã bị khóa.',
      };
    }

    // Whitelist: chỉ ACTIVE/INITIALIZED mới được tiếp tục
    if (!ALLOWED.includes(session.status)) {
      const messages: Partial<Record<AttemptStatus, string>> = {
        [AttemptStatus.SUBMITTED]: 'Bài thi đã được nộp.',
        [AttemptStatus.VIOLATED]: 'Bài thi đã bị khóa do vi phạm quy chế. Vui lòng liên hệ giám thị.',
        [AttemptStatus.TERMINATED]: 'Bài thi đã bị kết thúc. Vui lòng liên hệ giám thị.',
      };
      return {
        status: session.status,
        locked: true,
        message: messages[session.status] ?? 'Bài thi không hợp lệ.',
      };
    }

    // Hợp lệ → refresh TTL
    session.lastPingAt = new Date().toISOString();
    await this.redisService.setJson(key, session, ATTEMPT_SESSION_TTL);

    return { status: session.status, locked: false };
  }


  async submitAttempt(userId: number, attemptId: number, dto: SubmitAttemptDto) {
    const lockKey = REDIS_KEYS.submitLock(attemptId);

    const acquired = await this.redisService.acquireLock(lockKey, 30);
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
      // Xóa submit lock key (releaseLock trong finally cũng xóa, nhưng xóa session lock sớm)
      await this.redisService.del(REDIS_KEYS.submitLock(attemptId));

      this.logger.log(
        `Attempt submitted: attemptId=${attemptId}, userId=${userId}, score=${result.score.score}`,
      );
      return result.score;
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  // ─── Other getters ────────────────────────────────────────────────────────

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
    if (status === AttemptStatus.SUBMITTED) throw new AttemptAlreadySubmittedException();
    if (status === AttemptStatus.TERMINATED) throw new AttemptTerminatedException();
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
