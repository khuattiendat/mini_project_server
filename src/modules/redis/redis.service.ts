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


  // ── List operations (dùng cho violation buffer) ───────────────────────────

  /** Append một JSON item vào cuối list, trả về index (0-based) của item vừa push */
  async rpushJson<T>(key: string, value: T, ttl?: number): Promise<number> {
    const len = await this.client.rpush(key, JSON.stringify(value));
    if (ttl) await this.client.expire(key, ttl);
    // len là độ dài list sau khi push → index = len - 1
    return len - 1;
  }

  /** Đọc toàn bộ list dưới dạng mảng JSON */
  async lrangeJson<T>(key: string): Promise<T[]> {
    const items = await this.client.lrange(key, 0, -1);
    return items.map((raw) => {
      try { return JSON.parse(raw) as T; }
      catch { return null as unknown as T; }
    }).filter(Boolean);
  }

  /**
   * Đọc một item tại index cụ thể trong list (Bug 5 fix: dùng LINDEX thay LRANGE).
   * Hiệu quả hơn khi chỉ cần đọc 1 item trong list lớn.
   */
  async lindexJson<T>(key: string, index: number): Promise<T | null> {
    const raw = await this.client.lindex(key, index);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; }
    catch { return null; }
  }

  /** Cập nhật item tại index trong list */
  async lsetJson<T>(key: string, index: number, value: T): Promise<void> {
    await this.client.lset(key, index, JSON.stringify(value));
  }

  /** Độ dài list */
  llen(key: string): Promise<number> {
    return this.client.llen(key);
  }
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
