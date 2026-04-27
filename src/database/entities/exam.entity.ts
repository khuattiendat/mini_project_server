import { BaseEntity } from 'src/common/base/base.entity';
import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { ExamAttempt } from './examAttempt.entity';
import { Question } from './question.entity';
import { User } from './user.entity';

@Index('IDX_exams_start_date', ['startDate'])
@Index('IDX_exams_is_public', ['isPublic'])
@Entity('exams')
export class Exam extends BaseEntity {
  @Column({
    name: 'title',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  title!: string;

  @Column({
    name: 'description',
    type: 'text',
    nullable: true,
  })
  description?: string | null;

  @Column({
    name: 'duration',
    type: 'int',
    nullable: false,
  })
  duration!: number;

  @Column({
    name: 'start_date',
    type: 'timestamp',
    nullable: false,
  })
  startDate!: Date;

  @Column({
    name: 'is_public',
    type: 'boolean',
    default: false,
    nullable: false,
  })
  isPublic!: boolean;

  // Relations
  @OneToMany(() => Question, (question) => question.exam)
  questions!: Question[];

  @OneToMany(() => ExamAttempt, (examAttempt) => examAttempt.exam)
  examAttempts!: ExamAttempt[];

  @ManyToMany(() => User, (user) => user.assignedExams)
  @JoinTable({
    name: 'exam_user_assignments',
    joinColumn: { name: 'exam_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  assignedUsers!: User[];
}
