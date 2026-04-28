import { Global, Module, DynamicModule, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from 'src/common/constants/redis.constants';
import {
  RedisModuleOptions,
  RedisModuleAsyncOptions,
  RedisOptionsFactory,
} from 'src/common/interfaces/redis.interfaces';

const createRedisClient = (options: RedisModuleOptions): Redis => {
  return new Redis({
    host: options.host,
    port: options.port,
    password: options.password,
    db: options.db ?? 0,
  });
};

@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: () => createRedisClient(options),
    };

    return {
      module: RedisModule,
      providers: [redisProvider, RedisService],
      exports: [RedisService],
    };
  }

  static forRootAsync(options: RedisModuleAsyncOptions): DynamicModule {
    const redisProvider: Provider = {
      provide: REDIS_CLIENT,
      useFactory: async (...args: any[]) => {
        const resolved = options.useFactory
          ? await options.useFactory(...args)
          : await (args[0] as RedisOptionsFactory).createRedisOptions();

        return createRedisClient(resolved);
      },
      inject: options.useFactory
        ? (options.inject ?? [])
        : [options.useExisting ?? options.useClass!],
    };

    const extraProviders: Provider[] = options.useClass
      ? [{ provide: options.useClass, useClass: options.useClass }]
      : [];

    return {
      module: RedisModule,
      imports: options.imports ?? [],
      providers: [redisProvider, ...extraProviders, RedisService],
      exports: [RedisService],
    };
  }
}
