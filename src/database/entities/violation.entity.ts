import { BaseEntity } from 'src/common/base/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ExamAttempt } from './examAttempt.entity';

@Index('IDX_violations_attempt_id', ['attemptId'])
@Index('IDX_violations_type', ['type'])
@Entity('violations')
export class Violation extends BaseEntity {
  @Column({
    name: 'attempt_id',
    type: 'int',
    nullable: false,
  })
  attemptId!: number;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  type!: string;
  @Column({
    name: 'metadata',
    type: 'json',
    nullable: true,
  })
  metadata!: Record<string, any> | null;

  @ManyToOne(() => ExamAttempt, (examAttempt) => examAttempt.violations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attempt_id' })
  attempt!: ExamAttempt;
}
