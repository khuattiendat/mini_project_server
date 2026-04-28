import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class StartAttemptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  examId!: number;

  @IsNotEmpty()
  @IsString()
  device_id!: string;
}
