import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Choice } from 'src/database/entities/choice.entity';
import { Exam } from 'src/database/entities/exam.entity';
import { Question } from 'src/database/entities/question.entity';
import { QuestionController } from './question.controller';
import { QuestionService } from './question.service';

@Module({
  imports: [TypeOrmModule.forFeature([Question, Choice, Exam])],
  controllers: [QuestionController],
  providers: [QuestionService],
})
export class QuestionModule {}
