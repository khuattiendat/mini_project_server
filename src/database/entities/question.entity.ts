import { BaseEntity } from 'src/common/base/base.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Choice } from './choice.entity';
import { Exam } from './exam.entity';
import { UserAnswer } from './userAnswer.entity';

@Index('IDX_questions_exam_id', ['examId'])
@Entity('questions')
export class Question extends BaseEntity {
  @Column({
    name: 'exam_id',
    type: 'int',
    nullable: false,
  })
  examId!: number;
  @Column({
    name: 'content',
    type: 'text',
    nullable: false,
  })
  content!: string;

  @Column({
    name: 'order_index',
    type: 'int',
    nullable: false,
    default: 1,
  })
  orderIndex!: number;

  // relations

  @ManyToOne(() => Exam, (exam) => exam.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam!: Exam;

  @OneToMany(() => Choice, (choice) => choice.question)
  choices!: Choice[];

  @OneToMany(() => UserAnswer, (userAnswer) => userAnswer.question)
  userAnswers!: UserAnswer[];
}
