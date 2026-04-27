import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserStatus } from 'src/database/entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
