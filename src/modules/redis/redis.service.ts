import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
  ) {}

  getClient(): Redis {
    return this.client;
  }


  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  set(key: string, value: string, ttl?: number): Promise<'OK'> {
    return ttl
      ? this.client.set(key, value, 'EX', ttl)
      : this.client.set(key, value);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJson<T>(key: string, value: T, ttl?: number): Promise<'OK'> {
    return this.set(key, JSON.stringify(value), ttl);
  }

  del(key: string): Promise<number> {
    return this.client.del(key);
  }

  exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }


  async acquireLock(key: string, ttl: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'EX', ttl, 'NX');
    return result === 'OK';
  }

  releaseLock(key: string): Promise<number> {
    return this.client.del(key);
  }


  async incr(key: string, ttl?: number): Promise<number> {
    const value = await this.client.incr(key);
    if (ttl) await this.client.expire(key, ttl);
    return value;
  }

  expire(key: string, ttl: number): Promise<number> {
    return this.client.expire(key, ttl);
  }


  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
