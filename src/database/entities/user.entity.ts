import { BaseEntity } from 'src/common/base/base.entity';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { ExamAttempt } from './examAttempt.entity';
import { UserLog } from './userLog.entity';
import { RefreshToken } from './refresh-token.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Index('IDX_users_role', ['role'])
@Index('IDX_users_status', ['status'])
@Entity('users')
export class User extends BaseEntity {
  @Index('UQ_users_user_name', { unique: true })
  @Column({
    type: 'varchar',
    length: 255,
    nullable: false,
    name: 'user_name',
  })
  userName!: string;
  @Column({
    type: 'varchar',
    name: 'password',
    nullable: false,
  })
  password!: string;

  @Column({
    name: 'full_name',
    type: 'varchar',
    length: 255,
    nullable: false,
  })
  fullName!: string;
  @Index('IDX_users_device_id')
  @Column({
    name: 'device_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  deviceId!: string | null;
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role!: UserRole;
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @OneToMany(() => ExamAttempt, (examAttempt) => examAttempt.user)
  examAttempts!: ExamAttempt[];

  @OneToMany(() => UserLog, (userLog) => userLog.user)
  userLogs!: UserLog[];

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens!: RefreshToken[];
}
