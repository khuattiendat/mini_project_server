import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User, UserRole } from 'src/database/entities/user.entity';
import { JwtGuard, RolesGuard } from '../auth';
import { AttemptService } from './attempt.service';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { PingAttemptDto } from './dto/ping-attempt.dto';

@UseGuards(JwtGuard, RolesGuard)
@Roles(UserRole.USER)
@Controller('attempts')
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: User, @Body() dto: StartAttemptDto) {
    return this.attemptService.startAttempt(user.id, dto);
  }

  @Get('exam/:examId')
  @HttpCode(HttpStatus.OK)
  getAttemptByExam(
    @CurrentUser() user: User,
    @Param('examId', ParseIntPipe) examId: number,
    @Query('device_id') deviceId: string,
  ) {
    return this.attemptService.getAttemptByExam(user.id, examId, deviceId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  getDetail(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.attemptService.getAttemptDetail(user.id, id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.attemptService.submitAttempt(user.id, id, dto);
  }

  @Post(':id/ping')
  @HttpCode(HttpStatus.OK)
  ping(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PingAttemptDto,
  ) {
    return this.attemptService.pingAttempt(user.id, id, dto.device_id);
  }
}
