import { IsEnum, IsOptional } from 'class-validator';
import { BaseQuryDto } from 'src/common/base/base.query';
import { UserStatus } from 'src/database/entities/user.entity';

export class UserQueryDto extends BaseQuryDto {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
