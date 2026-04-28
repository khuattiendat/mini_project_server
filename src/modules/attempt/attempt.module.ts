import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Choice } from 'src/database/entities/choice.entity';
import { Exam } from 'src/database/entities/exam.entity';
import { ExamAttempt } from 'src/database/entities/examAttempt.entity';
import { Question } from 'src/database/entities/question.entity';
import { UserAnswer } from 'src/database/entities/userAnswer.entity';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { ViolationModule } from '../violation/violation.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamAttempt, Exam, Question, Choice, UserAnswer]),
    ViolationModule,
    RedisModule,
  ],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
