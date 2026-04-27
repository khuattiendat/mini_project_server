import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignUsersDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  userIds!: number[];
}
