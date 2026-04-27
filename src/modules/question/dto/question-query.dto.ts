import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { BaseQuryDto } from 'src/common/base/base.query';

export class QuestionQueryDto extends BaseQuryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  examId?: number;
}
