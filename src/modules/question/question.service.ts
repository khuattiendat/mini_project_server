import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Choice } from 'src/database/entities/choice.entity';
import { Exam } from 'src/database/entities/exam.entity';
import { Question } from 'src/database/entities/question.entity';
import { Repository } from 'typeorm';
import { CreateQuestionDto } from './dto/create-question.dto';
import { QuestionChoiceDto } from './dto/question-choice.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Injectable()
export class QuestionService {
  constructor(
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(Choice)
    private readonly choiceRepository: Repository<Choice>,
    @InjectRepository(Exam)
    private readonly examRepository: Repository<Exam>,
  ) {}

  async create(createQuestionDto: CreateQuestionDto) {
    this.ensureSingleCorrectChoice(createQuestionDto.choices);

    await this.findExamOrThrow(createQuestionDto.examId);

    const savedQuestion = await this.questionRepository.manager.transaction(
      async (manager) => {
        const questionRepo = manager.getRepository(Question);
        const choiceRepo = manager.getRepository(Choice);

        const question = questionRepo.create({
          examId: createQuestionDto.examId,
          content: createQuestionDto.content,
          orderIndex:
            createQuestionDto.orderIndex ??
            (await this.getNextOrderIndex(
              questionRepo,
              createQuestionDto.examId,
            )),
        });

        const createdQuestion = await questionRepo.save(question);

        const choices = createQuestionDto.choices.map((choice) =>
          choiceRepo.create({
            questionId: createdQuestion.id,
            content: choice.content,
            isCorrect: choice.isCorrect,
          }),
        );

        await choiceRepo.save(choices);

        return questionRepo.findOne({
          where: { id: createdQuestion.id },
          relations: ['exam', 'choices'],
        });
      },
    );

    if (!savedQuestion) {
      throw new NotFoundException('Failed to create question');
    }

    return this.toResponse(savedQuestion);
  }

  async findAll(query: QuestionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();

    const qb = this.questionRepository.createQueryBuilder('question');

    qb.leftJoinAndSelect('question.exam', 'exam');
    qb.leftJoinAndSelect('question.choices', 'choices');
    qb.andWhere('question.deletedAt IS NULL');

    if (search) {
      const searchTerm = `%${search}%`;

      qb.andWhere(
        '(question.content LIKE :searchTerm OR exam.title LIKE :searchTerm OR CAST(question.id AS CHAR) LIKE :searchTerm)',
        { searchTerm },
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
      items: items.map((question) => this.toResponse(question)),
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
    const question = await this.findQuestionOrThrow(id);

    return this.toResponse(question);
  }

  async update(id: number, updateQuestionDto: UpdateQuestionDto) {
    const choicesToUpdate = updateQuestionDto.choices as
      | QuestionChoiceDto[]
      | undefined;

    if (choicesToUpdate) {
      this.ensureSingleCorrectChoice(choicesToUpdate);
    }

    const updatedQuestion = await this.questionRepository.manager.transaction(
      async (manager) => {
        const questionRepo = manager.getRepository(Question);
        const choiceRepo = manager.getRepository(Choice);

        const question = await questionRepo.findOne({
          where: { id },
          relations: ['exam', 'choices'],
        });

        if (!question) {
          throw new NotFoundException(`Question with id ${id} not found`);
        }

        if (updateQuestionDto.examId !== undefined) {
          const exam = await this.findExamOrThrow(updateQuestionDto.examId);
          question.examId = updateQuestionDto.examId;
          question.exam = exam;
        }

        if (updateQuestionDto.content !== undefined) {
          question.content = updateQuestionDto.content;
        }

        if (updateQuestionDto.orderIndex !== undefined) {
          question.orderIndex = Number(updateQuestionDto.orderIndex);
        }

        const savedQuestion = await questionRepo.save(question);

        if (choicesToUpdate) {
          await choiceRepo.delete({ questionId: savedQuestion.id });

          const choices = choicesToUpdate.map((choice) =>
            choiceRepo.create({
              questionId: savedQuestion.id,
              content: choice.content,
              isCorrect: choice.isCorrect,
            }),
          );

          await choiceRepo.save(choices);
        }

        return questionRepo.findOne({
          where: { id: savedQuestion.id },
          relations: ['exam', 'choices'],
        });
      },
    );

    if (!updatedQuestion) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }

    return this.toResponse(updatedQuestion);
  }

  async remove(id: number) {
    await this.findQuestionOrThrow(id);

    await this.questionRepository.softDelete(id);

    return {
      message: 'Question deleted successfully',
    };
  }

  private async findQuestionOrThrow(id: number): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id },
      relations: ['exam', 'choices'],
    });

    if (!question) {
      throw new NotFoundException(`Question with id ${id} not found`);
    }

    return question;
  }

  private async findExamOrThrow(examId: number): Promise<Exam> {
    const exam = await this.examRepository.findOne({ where: { id: examId } });

    if (!exam) {
      throw new NotFoundException(`Exam with id ${examId} not found`);
    }

    return exam;
  }

  private ensureSingleCorrectChoice(choices: QuestionChoiceDto[]): void {
    const correctChoices = choices.filter((choice) => choice.isCorrect);

    if (correctChoices.length !== 1) {
      throw new BadRequestException(
        'Question must have exactly one correct choice',
      );
    }
  }

  private toResponse(question: Question) {
    return {
      id: question.id,
      examId: question.examId,
      examTitle: question.exam?.title ?? null,
      content: question.content,
      orderIndex: question.orderIndex,
      choices:
        question.choices?.map((choice) => ({
          id: choice.id,
          content: choice.content,
          isCorrect: choice.isCorrect,
        })) ?? [],
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      deletedAt: question.deletedAt,
    };
  }

  private async getNextOrderIndex(
    questionRepo: Repository<Question>,
    examId: number,
  ): Promise<number> {
    const result = await questionRepo
      .createQueryBuilder('question')
      .select('COALESCE(MAX(question.orderIndex), 0)', 'max')
      .where('question.examId = :examId', { examId })
      .getRawOne<{ max?: string }>();

    return Number.parseInt(result?.max ?? '0', 10) + 1;
  }
}
