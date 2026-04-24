import { BaseEntity } from 'src/common/base/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { Choice } from './choice.entity';
import { ExamAttempt } from './examAttempt.entity';
import { Question } from './question.entity';

@Index('IDX_user_answers_attempt_id', ['attemptId'])
@Index('IDX_user_answers_question_id', ['questionId'])
@Index('IDX_user_answers_selected_choice_id', ['selectedChoiceId'])
@Index('IDX_user_answers_is_correct', ['isCorrect'])
@Unique('UQ_user_answers_attempt_question', ['attemptId', 'questionId'])
@Entity('user_answers')
export class UserAnswer extends BaseEntity {
  @Column({
    name: 'attempt_id',
    type: 'int',
    nullable: false,
  })
  attemptId!: number;

  @Column({
    name: 'question_id',
    type: 'int',
    nullable: false,
  })
  questionId!: number;

  @Column({
    name: 'selected_choice_id',
    type: 'int',
    nullable: false,
  })
  selectedChoiceId!: number;

  @Column({
    name: 'is_correct',
    type: 'boolean',
    nullable: true,
  })
  isCorrect!: boolean | null;

  @ManyToOne(() => ExamAttempt, (examAttempt) => examAttempt.userAnswers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id' })
  attempt!: ExamAttempt;

  @ManyToOne(() => Question, (question) => question.userAnswers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @ManyToOne(() => Choice, (choice) => choice.userAnswers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'selected_choice_id' })
  selectedChoice!: Choice;
}
