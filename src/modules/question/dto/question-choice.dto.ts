import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class QuestionChoiceDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsBoolean()
  isCorrect!: boolean;
}
