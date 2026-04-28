import { IsNotEmpty, IsString } from 'class-validator';

export class PingAttemptDto {
  @IsNotEmpty()
  @IsString()
  device_id!: string;
}
