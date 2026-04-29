import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Violation } from 'src/database/entities/violation.entity';
import { UserLog } from 'src/database/entities/userLog.entity';
import { Repository } from 'typeorm';

export enum ViolationType {
  DEVICE_MISMATCH = 'DEVICE_MISMATCH',
  TAB_SWITCH = 'TAB_SWITCH',
  WINDOW_BLUR = 'WINDOW_BLUR',
  COPY_PASTE = 'COPY_PASTE',
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  DEV_TOOLS = 'DEV_TOOLS',
  SCREENSHOT = 'SCREENSHOT',
  AUTOMATION = 'AUTOMATION',
  OTHER = 'OTHER',
}

@Injectable()
export class ViolationService {
  private readonly logger = new Logger(ViolationService.name);

  constructor(
    @InjectRepository(Violation)
    private readonly violationRepository: Repository<Violation>,
    @InjectRepository(UserLog)
    private readonly userLogRepository: Repository<UserLog>,
  ) {}

  async logViolation(params: {
    attemptId: number;
    userId: number;
    type: ViolationType;
    message: string;
    metadata?: Record<string, any>;
  }) {
    const { attemptId, userId, type, message, metadata } = params;

    const fullMetadata = { message, ...metadata };

    await this.violationRepository.save({
      attemptId,
      type,
      metadata: fullMetadata,
    });

    await this.userLogRepository.save({
      userId,
      action: `VIOLATION_${type}`,
      objectType: 'ExamAttempt',
      refId: attemptId,
      metadata: fullMetadata,
    });

    this.logger.warn(
      `Violation logged: type=${type}, userId=${userId}, attemptId=${attemptId}, message="${message}", metadata=${JSON.stringify(metadata)}`,
    );
  }
}
