import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Violation } from 'src/database/entities/violation.entity';
import { ViolationService } from './violation.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Violation]),
    RedisModule,
  ],
  providers: [ViolationService],
  exports: [ViolationService],
})
export class ViolationModule {}
