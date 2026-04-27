import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Choice } from 'src/database/entities/choice.entity';
import { Exam } from 'src/database/entities/exam.entity';
import { Question } from 'src/database/entities/question.entity';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionChoiceDto } from './dto/question-choice.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(Choice)
    private readonly choiceRepository: Repository<Choice>,
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(dto: CreateQuestionDto) {
    this.validateSingleCorrectChoice(dto.choices);
    await this.findExamOrThrow(dto.examId);

    const question = await this.dataSource.transaction(async (manager) => {
      const orderIndex =
        dto.orderIndex ?? (await this.getNextOrderIndex(manager, dto.examId));

      const created = await manager.getRepository(Question).save(
        manager.getRepository(Question).create({
          examId: dto.examId,
          content: dto.content,
          orderIndex,
        }),
      );

      await this.saveChoices(manager, created.id, dto.choices);

      return manager.getRepository(Question).findOne({
        where: { id: created.id },
        relations: ['exam', 'choices'],
      });
    });

    if (!question) throw new NotFoundException('Failed to create question');

    this.logger.log(`Question created: id=${question.id}, examId=${dto.examId}`);
    return this.toResponse(question);
  }

  async findAll(query: QuestionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.questionRepository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.exam', 'exam')
      .leftJoinAndSelect('question.choices', 'choices')
      .where('question.deletedAt IS NULL');

    if (search) {
      qb.andWhere(
        '(question.content LIKE :s OR exam.title LIKE :s OR CAST(question.id AS CHAR) LIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (query.examId) {
      qb.andWhere('question.examId = :examId', { examId: query.examId });
    }

    const [items, totalItems] = await qb
      .orderBy(
        query.examId ? 'question.orderIndex' : 'question.createdAt',
        query.examId ? 'ASC' : 'DESC',
      )
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      items: items.map((q) => this.toResponse(q)),
      meta: this.buildMeta(page, limit, totalItems),
    };
  }

  async findOne(id: number) {
    return this.toResponse(await this.findQuestionOrThrow(id));
  }

  async update(id: number, dto: UpdateQuestionDto) {
    const choices = dto.choices as QuestionChoiceDto[] | undefined;
    if (choices) this.validateSingleCorrectChoice(choices);

    const question = await this.dataSource.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);

      const existing = await questionRepo.findOne({
        where: { id },
        relations: ['exam', 'choices'],
      });
      if (!existing) throw new NotFoundException(`Question with id ${id} not found`);

      if (dto.examId !== undefined) {
        existing.exam = await this.findExamOrThrow(dto.examId);
        existing.examId = dto.examId;
      }
      if (dto.content !== undefined) existing.content = dto.content;
      if (dto.orderIndex !== undefined) existing.orderIndex = Number(dto.orderIndex);

      const saved = await questionRepo.save(existing);

      if (choices) {
        await manager.getRepository(Choice).delete({ questionId: saved.id });
        await this.saveChoices(manager, saved.id, choices);
      }

      return questionRepo.findOne({
        where: { id: saved.id },
        relations: ['exam', 'choices'],
      });
    });

    if (!question) throw new NotFoundException(`Question with id ${id} not found`);

    this.logger.log(`Question updated: id=${id}`);
    return this.toResponse(question);
  }

  async remove(id: number) {
    await this.findQuestionOrThrow(id);
    await this.questionRepository.softDelete(id);
    this.logger.log(`Question deleted: id=${id}`);
    return { message: 'Question deleted successfully' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findQuestionOrThrow(id: number): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['exam', 'choices'],
    });
    if (!question) throw new NotFoundException(`Question with id ${id} not found`);
    return question;
  }

  private async findExamOrThrow(examId: number): Promise<Exam> {
    const exam = await this.examRepository.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Exam with id ${examId} not found`);
    return exam;
  }

  private validateSingleCorrectChoice(choices: QuestionChoiceDto[]): void {
    const correctCount = choices.filter((c) => c.isCorrect).length;
    if (correctCount !== 1) {
      throw new BadRequestException('Question must have exactly one correct choice');
    }
  }

  private async saveChoices(
    manager: EntityManager,
    questionId: number,
    choices: QuestionChoiceDto[],
  ): Promise<void> {
    const choiceRepo = manager.getRepository(Choice);
    await choiceRepo.save(
      choices.map((c) =>
        choiceRepo.create({ questionId, content: c.content, isCorrect: c.isCorrect }),
      ),
    );
  }

  private async getNextOrderIndex(
    manager: EntityManager,
    examId: number,
  ): Promise<number> {
    const result = await manager
      .getRepository(Question)
      .createQueryBuilder('question')
      .select('COALESCE(MAX(question.orderIndex), 0)', 'max')
      .where('question.examId = :examId', { examId })
      .getRawOne<{ max?: string }>();

    return Number.parseInt(result?.max ?? '0', 10) + 1;
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

  private toResponse(question: Question) {
    return {
      id: question.id,
      examId: question.examId,
      examTitle: question.exam?.title ?? null,
      content: question.content,
      orderIndex: question.orderIndex,
      choices: question.choices?.map((c) => ({
        id: c.id,
        content: c.content,
        isCorrect: c.isCorrect,
      })) ?? [],
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      deletedAt: question.deletedAt,
    };
  }
}
