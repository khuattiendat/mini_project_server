import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Violation } from 'src/database/entities/violation.entity';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import {
  REDIS_KEYS,
  VIOLATION_BUFFER_TTL,
} from 'src/common/constants/redis.constants';

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

/** Shape của một vi phạm trong Redis buffer */
interface BufferedViolation {
  /** Index trong list Redis (dùng để lset khi resolve) */
  bufferIndex: number;
  type: ViolationType;
  message: string;
  metadata: Record<string, any>;
  createdAt: string; // ISO string
}

@Injectable()
export class ViolationService {
  private readonly logger = new Logger(ViolationService.name);

  constructor(
    @InjectRepository(Violation)
    private readonly violationRepository: Repository<Violation>,
    private readonly redisService: RedisService,
  ) {}

  // ─── Immediate log (dùng cho vi phạm lock ngay: DEVICE_MISMATCH, v.v.) ───

  /**
   * Ghi vi phạm trực tiếp vào DB ngay lập tức.
   * Dùng cho các vi phạm nghiêm trọng cần persist ngay (DEVICE_MISMATCH,
   * lock cuối cùng) — không qua Redis buffer.
   */
  async logViolation(params: {
    attemptId: number;
    userId: number;
    type: ViolationType;
    message: string;
    metadata?: Record<string, any>;
  }): Promise<Violation> {
    const { attemptId, type, message, metadata } = params;

    const fullMetadata = { message, source: 'server', ...metadata };

    const saved = await this.violationRepository.save({
      attemptId,
      type,
      metadata: fullMetadata,
    });

    this.logger.warn(
      `Violation logged (immediate): type=${type}, attemptId=${attemptId}, message="${message}"`,
    );

    return saved;
  }

  // ─── Buffered log (dùng cho grace period / COPY_PASTE warnings) ───────────

  /**
   * Đẩy vi phạm vào Redis buffer — KHÔNG ghi DB ngay.
   * Buffer sẽ được flush xuống DB khi bài thi kết thúc (lock/submit).
   *
   * Graceful degradation: nếu Redis down → ghi thẳng vào DB ngay lập tức
   * (mất tính năng resolve grace period, nhưng không mất dữ liệu vi phạm).
   * Trả về violationId = -1 khi fallback để caller biết resolve sẽ không hoạt động.
   */
  async bufferViolation(params: {
    attemptId: number;
    type: ViolationType;
    message: string;
    metadata?: Record<string, any>;
  }): Promise<{ violationId: number }> {
    const { attemptId, type, message, metadata } = params;

    const fullMetadata = { message, source: 'client', ...metadata };
    const key = REDIS_KEYS.violationBuffer(attemptId);

    // Dùng Lua script để RPUSH + lấy index atomic — tránh race condition
    // khi nhiều vi phạm đến đồng thời.
    const luaScript = `
      local len = redis.call('RPUSH', KEYS[1], ARGV[1])
      if ARGV[2] ~= '0' then
        redis.call('EXPIRE', KEYS[1], ARGV[2])
      end
      return len - 1
    `;

    const createdAt = new Date().toISOString();

    try {
      // Placeholder item — bufferIndex sẽ được cập nhật ngay sau bằng LSET
      const placeholder = JSON.stringify({
        bufferIndex: -1,
        type,
        message,
        metadata: fullMetadata,
        createdAt,
      });

      const bufferIndex = (await this.redisService
        .getClient()
        .eval(
          luaScript,
          1,
          key,
          placeholder,
          String(VIOLATION_BUFFER_TTL),
        )) as number;

      // Cập nhật bufferIndex chính xác vào item
      const finalItem = JSON.stringify({
        bufferIndex,
        type,
        message,
        metadata: fullMetadata,
        createdAt,
      });
      await this.redisService.getClient().lset(key, bufferIndex, finalItem);

      this.logger.log(
        `Violation buffered: type=${type}, attemptId=${attemptId}, bufferIndex=${bufferIndex}`,
      );

      return { violationId: bufferIndex };
    } catch (err) {
      // ── Graceful degradation: Redis down → ghi thẳng DB ──────────────────
      this.logger.warn(
        `[Redis] bufferViolation failed, falling back to direct DB write: ${(err as Error).message}`,
      );
      await this.violationRepository.save({
        attemptId,
        type,
        metadata: { ...fullMetadata, redisDown: true, createdAt },
      });
      // violationId = -1 báo hiệu cho caller rằng resolve sẽ không hoạt động
      return { violationId: -1 };
    }
  }

  /**
   * Đánh dấu vi phạm trong buffer là đã resolved (thí sinh quay lại grace period).
   * violationId ở đây là bufferIndex.
   *
   * Graceful degradation: nếu violationId = -1 (Redis đã down khi buffer)
   * hoặc Redis hiện down → bỏ qua silently (vi phạm đã được ghi DB rồi).
   */
  async resolveBufferedViolation(
    attemptId: number,
    bufferIndex: number,
  ): Promise<void> {
    // violationId = -1 nghĩa là vi phạm đã được ghi thẳng DB (Redis down lúc buffer)
    // Không có gì để resolve trong buffer
    if (bufferIndex === -1) {
      this.logger.warn(
        `resolveBufferedViolation: bufferIndex=-1 (Redis was down during buffer), skipping resolve for attemptId=${attemptId}`,
      );
      return;
    }

    const key = REDIS_KEYS.violationBuffer(attemptId);

    try {
      const item = await this.redisService.lindexJson<BufferedViolation>(
        key,
        bufferIndex,
      );

      if (!item) {
        this.logger.warn(
          `resolveBufferedViolation: bufferIndex=${bufferIndex} not found for attemptId=${attemptId}`,
        );
        return;
      }

      const updated: BufferedViolation = {
        ...item,
        metadata: {
          ...item.metadata,
          resolved: true,
          resolvedAt: new Date().toISOString(),
        },
      };

      await this.redisService.lsetJson(key, bufferIndex, updated);

      this.logger.log(
        `Violation resolved in buffer: attemptId=${attemptId}, bufferIndex=${bufferIndex}`,
      );
    } catch (err) {
      // Graceful degradation: Redis down khi resolve → bỏ qua, không throw
      // Vi phạm vẫn được ghi nhận, chỉ mất thông tin resolved
      this.logger.warn(
        `[Redis] resolveBufferedViolation failed, skipping: ${(err as Error).message}`,
      );
    }
  }

  // ─── Flush buffer → DB ────────────────────────────────────────────────────

  /**
   * Đọc toàn bộ buffer từ Redis, bulk insert vào bảng violations, xóa key.
   * Gọi khi bài thi kết thúc (submit hoặc lock).
   *
   * Graceful degradation: nếu Redis down → bỏ qua silently.
   * Các vi phạm quan trọng (lock trigger) đã được ghi DB trực tiếp qua logViolation().
   * Idempotent: nếu buffer rỗng hoặc key không tồn tại thì không làm gì.
   */
  async flushViolationBuffer(attemptId: number): Promise<void> {
    try {
      const key = REDIS_KEYS.violationBuffer(attemptId);
      const items = await this.redisService.lrangeJson<BufferedViolation>(key);

      if (items.length === 0) return;

      const records = items.map((item) => ({
        attemptId,
        type: item.type,
        metadata: item.metadata,
      }));

      // Chỉ xóa buffer SAU KHI insert thành công.
      // Nếu insert thất bại → buffer vẫn còn → có thể retry sau.
      await this.violationRepository.save(records);
      await this.redisService.del(key);

      this.logger.log(
        `Violation buffer flushed: attemptId=${attemptId}, count=${records.length}`,
      );
    } catch (err) {
      // Graceful degradation: Redis down khi flush → log warn, không throw
      // Không block luồng submit/lock vì đây là best-effort
      this.logger.warn(
        `[Redis] flushViolationBuffer failed for attemptId=${attemptId}: ${(err as Error).message}`,
      );
    }
  }
}
