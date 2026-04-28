import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { envConfig } from './config/env.config';
import { AuthModule } from './modules/auth/auth.module';
import { AttemptModule } from './modules/attempt/attempt.module';
import { ExamModule } from './modules/exam/exam.module';
import { QuestionModule } from './modules/question/question.module';
import { UserModule } from './modules/user/user.module';
import { ViolationModule } from './modules/violation/violation.module';
import { RedisModule } from './modules/redis/redis.module';
import { redisConfig } from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot(envConfig),
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => (redisConfig(configService)),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        databaseConfig(configService),
    }),
    AuthModule,
    AttemptModule,
    ExamModule,
    QuestionModule,
    UserModule,
    ViolationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
