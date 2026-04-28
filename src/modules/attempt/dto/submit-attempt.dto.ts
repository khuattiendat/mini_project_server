import { Type } from 'class-transformer';
import { IsArray, IsInt, Min, ValidateNested } from 'class-validator';

export class AnswerItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  questionId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  selectedChoiceId!: number;
}

export class SubmitAttemptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItemDto)
  answers!: AnswerItemDto[];
}
