import { BaseEntity } from 'src/common/base/base.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { ExamAttempt } from './examAttempt.entity';
import { Question } from './question.entity';

@Index('IDX_exams_start_date', ['startDate'])
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

  @OneToMany(() => Question, (question) => question.exam)
  questions!: Question[];

  @OneToMany(() => ExamAttempt, (examAttempt) => examAttempt.exam)
  examAttempts!: ExamAttempt[];
}
