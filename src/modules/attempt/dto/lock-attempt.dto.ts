import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ViolationType } from 'src/modules/violation/violation.service';

export class LockAttemptDto {
  @IsNotEmpty()
  @IsString()
  device_id!: string;

  @IsNotEmpty()
  @IsEnum(ViolationType)
  violation_type!: ViolationType;

  @IsOptional()
  @IsString()
  message?: string;
}
