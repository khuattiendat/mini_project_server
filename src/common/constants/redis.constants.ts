export const REDIS_CLIENT = 'REDIS_CLIENT';

export const REDIS_KEYS = {
  submitLock: (attemptId: number) => `lock:submit:${attemptId}`,
  startLock: (userId: number, examId: number) => `lock:start:${userId}:${examId}`,
  attemptSession: (attemptId: number) => `attempt:session:${attemptId}`,
  /** Buffer vi phạm trong Redis — flush xuống DB khi bài thi kết thúc */
  violationBuffer: (attemptId: number) => `violations:buffer:${attemptId}`,
};

// TTL = 3x ping interval (client ping mỗi 30s → session expire sau 90s không ping)
export const ATTEMPT_SESSION_TTL = 90;

/**
 * TTL cho violation buffer — dài hơn session rất nhiều để tránh mất dữ liệu
 * khi thí sinh mất mạng tạm thời.
 *
 * Nếu thí sinh mất mạng > 90s:
 * - Session hết hạn → không ping được nữa
 * - Nhưng buffer vẫn còn (TTL 24h) → khi có mạng lại, các vi phạm không bị mất
 *
 * Buffer chỉ hết hạn khi:
 * - Thí sinh bỏ thi > 24h (rất hiếm)
 * - Hoặc đã flush xuống DB khi bài thi kết thúc
 *
 * 24h = 86400s (đủ cho mọi kịch bản thi thực tế)
 */
export const VIOLATION_BUFFER_TTL = 86400; // 24 giờ
