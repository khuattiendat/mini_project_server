import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ViolationType } from 'src/modules/violation/violation.service';

export class LogViolationDto {
  @IsNotEmpty()
  @IsEnum(ViolationType)
  violation_type!: ViolationType;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
