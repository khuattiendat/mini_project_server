import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionChoiceDto } from './question-choice.dto';

export class CreateQuestionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  examId!: number;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderIndex?: number;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => QuestionChoiceDto)
  choices!: QuestionChoiceDto[];
}
