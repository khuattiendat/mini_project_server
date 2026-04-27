import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Exam } from 'src/database/entities/exam.entity';
import { ExamAttempt } from 'src/database/entities/examAttempt.entity';
import { Question } from 'src/database/entities/question.entity';
import { User } from 'src/database/entities/user.entity';
import { Violation } from 'src/database/entities/violation.entity';
import { ExamController } from './exam.controller';
import { ExamService } from './exam.service';

@Module({
  imports: [TypeOrmModule.forFeature([Exam, ExamAttempt, Question, User, Violation])],
  controllers: [ExamController],
  providers: [ExamService],
})
export class ExamModule {}
