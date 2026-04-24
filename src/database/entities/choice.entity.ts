import { BaseEntity } from 'src/common/base/base.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Question } from './question.entity';
import { UserAnswer } from './userAnswer.entity';

@Index('IDX_choices_question_id', ['questionId'])
@Entity('choices')
export class Choice extends BaseEntity {
  @Column({
    name: 'question_id',
    type: 'int',
    nullable: false,
  })
  questionId!: number;
  @Column({
    name: 'content',
    type: 'text',
    nullable: false,
  })
  content!: string;
  @Column({
    name: 'is_correct',
    type: 'boolean',
    nullable: false,
  })
  isCorrect!: boolean;

  @ManyToOne(() => Question, (question) => question.choices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @OneToMany(() => UserAnswer, (userAnswer) => userAnswer.selectedChoice)
  userAnswers!: UserAnswer[];
}
