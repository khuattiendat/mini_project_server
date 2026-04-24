import { BaseEntity } from 'src/common/base/base.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Exam } from './exam.entity';
import { UserAnswer } from './userAnswer.entity';
import { Violation } from './violation.entity';

export enum AttemptStatus {
  INITIALIZED = 'initialized',
  ACTIVE = 'active',
  VIOLATED = 'violated',
  SUBMITTED = 'submitted',
  TERMINATED = 'terminated',
}

@Index('IDX_exam_attempts_user_id', ['userId'])
@Index('IDX_exam_attempts_exam_id', ['examId'])
@Index('IDX_exam_attempts_status', ['status'])
@Index('IDX_exam_attempts_started_at', ['startedAt'])
@Index('IDX_exam_attempts_submitted_at', ['submittedAt'])
@Index('IDX_exam_attempts_ended_at', ['endedAt'])
@Unique('UQ_exam_attempts_user_exam_attempt_no', [
  'userId',
  'examId',
  'attemptNo',
])
@Entity('exam_attempts')
export class ExamAttempt extends BaseEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
  })
  userId!: number;

  @Column({
    name: 'exam_id',
    type: 'int',
    nullable: false,
  })
  examId!: number;
  @Column({
    name: 'attempt_no',
    type: 'int',
    nullable: false,
  })
  attemptNo!: number;
  @Column({
    name: 'status',
    type: 'enum',
    enum: AttemptStatus,
    default: AttemptStatus.INITIALIZED,
  })
  status!: AttemptStatus;
  @Column({
    name: 'device_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceId!: string | null;
  @Column({
    name: 'started_at',
    type: 'timestamp',
    nullable: true,
  })
  startedAt!: Date | null;
  @Column({
    name: 'submitted_at',
    type: 'timestamp',
    nullable: true,
  })
  submittedAt!: Date | null;

  @Column({
    name: 'ended_at',
    type: 'timestamp',
    nullable: true,
  })
  endedAt!: Date | null;

  @ManyToOne(() => User, (user) => user.examAttempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Exam, (exam) => exam.examAttempts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam!: Exam;

  @OneToMany(() => UserAnswer, (userAnswer) => userAnswer.attempt)
  userAnswers!: UserAnswer[];

  @OneToMany(() => Violation, (violation) => violation.attempt)
  violations!: Violation[];
}
