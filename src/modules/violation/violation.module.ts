import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Violation } from 'src/database/entities/violation.entity';
import { UserLog } from 'src/database/entities/userLog.entity';
import { ViolationService } from './violation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Violation, UserLog])],
  providers: [ViolationService],
  exports: [ViolationService],
})
export class ViolationModule {}
