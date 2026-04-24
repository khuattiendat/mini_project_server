import { BaseEntity } from 'src/common/base/base.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { User } from './user.entity';

@Index('IDX_user_logs_user_id', ['userId'])
@Index('IDX_user_logs_action', ['action'])
@Index('IDX_user_logs_object_type_ref_id', ['objectType', 'refId'])
@Entity('user_logs')
export class UserLog extends BaseEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
  })
  userId!: number;
  @Column({
    name: 'action',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  action!: string;
  @Column({
    name: 'object_type',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  objectType!: string | null;
  @Column({
    name: 'ref_id',
    type: 'int',
    nullable: true,
  })
  refId!: number | null;
  @Column({
    name: 'metadata',
    type: 'json',
    nullable: true,
  })
  metadata!: Record<string, any> | null;

  @ManyToOne(() => User, (user) => user.userLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
