import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/common/constants/redis.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly client: Redis,
  ) { }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Kiểm tra Redis có đang hoạt động không bằng PING.
   * Trả về true nếu healthy, false nếu down.
   * Dùng để quyết định fallback strategy ở tầng service.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn(`[Redis] get failed for key="${key}": ${(err as Error).message}`);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    try {
      return ttl
        ? await this.client.set(key, value, 'EX', ttl)
        : await this.client.set(key, value);
    } catch (err) {
      this.logger.warn(`[Redis] set failed for key="${key}": ${(err as Error).message}`);
      return 'OK'; // best-effort: không throw để caller tiếp tục
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`[Redis] getJson failed for key="${key}": ${(err as Error).message}`);
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttl?: number): Promise<'OK'> {
    return this.set(key, JSON.stringify(value), ttl);
  }

  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (err) {
      this.logger.warn(`[Redis] del failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  async exists(key: string): Promise<number> {
    try {
      return await this.client.exists(key);
    } catch (err) {
      this.logger.warn(`[Redis] exists failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.logger.warn(`[Redis] ttl failed for key="${key}": ${(err as Error).message}`);
      return -1;
    }
  }

  /**
   * Cố gắng acquire distributed lock.
   * Nếu Redis down → trả về true (allow through) để DB pessimistic lock
   * đảm nhận vai trò bảo vệ cuối cùng, tránh block toàn bộ hệ thống.
   */
  async acquireLock(key: string, ttl: number): Promise<boolean> {
    try {
      const result = await this.client.set(key, '1', 'EX', ttl, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.warn(
        `[Redis] acquireLock failed for key="${key}", falling back to DB lock: ${(err as Error).message}`,
      );
      // Fallback: cho phép đi qua, DB pessimistic lock sẽ bảo vệ
      return true;
    }
  }

  async releaseLock(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (err) {
      this.logger.warn(`[Redis] releaseLock failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  async incr(key: string, ttl?: number): Promise<number> {
    try {
      const value = await this.client.incr(key);
      if (ttl) await this.client.expire(key, ttl);
      return value;
    } catch (err) {
      this.logger.warn(`[Redis] incr failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<number> {
    try {
      return await this.client.expire(key, ttl);
    } catch (err) {
      this.logger.warn(`[Redis] expire failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  // ── List operations (dùng cho violation buffer) ───────────────────────────

  /** Append một JSON item vào cuối list, trả về index (0-based) của item vừa push */
  async rpushJson<T>(key: string, value: T, ttl?: number): Promise<number> {
    try {
      const len = await this.client.rpush(key, JSON.stringify(value));
      if (ttl) await this.client.expire(key, ttl);
      return len - 1;
    } catch (err) {
      this.logger.warn(`[Redis] rpushJson failed for key="${key}": ${(err as Error).message}`);
      return -1;
    }
  }

  /** Đọc toàn bộ list dưới dạng mảng JSON */
  async lrangeJson<T>(key: string): Promise<T[]> {
    try {
      const items = await this.client.lrange(key, 0, -1);
      return items
        .map((raw) => {
          try { return JSON.parse(raw) as T; }
          catch { return null as unknown as T; }
        })
        .filter(Boolean);
    } catch (err) {
      this.logger.warn(`[Redis] lrangeJson failed for key="${key}": ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Đọc một item tại index cụ thể trong list.
   * Hiệu quả hơn khi chỉ cần đọc 1 item trong list lớn.
   */
  async lindexJson<T>(key: string, index: number): Promise<T | null> {
    try {
      const raw = await this.client.lindex(key, index);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`[Redis] lindexJson failed for key="${key}": ${(err as Error).message}`);
      return null;
    }
  }

  /** Cập nhật item tại index trong list */
  async lsetJson<T>(key: string, index: number, value: T): Promise<void> {
    try {
      await this.client.lset(key, index, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`[Redis] lsetJson failed for key="${key}": ${(err as Error).message}`);
    }
  }

  /** Độ dài list */
  async llen(key: string): Promise<number> {
    try {
      return await this.client.llen(key);
    } catch (err) {
      this.logger.warn(`[Redis] llen failed for key="${key}": ${(err as Error).message}`);
      return 0;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
