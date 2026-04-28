export const REDIS_CLIENT = 'REDIS_CLIENT';

export const REDIS_KEYS = {
  submitLock: (attemptId: number) => `lock:submit:${attemptId}`,
  attemptSession: (attemptId: number) => `attempt:session:${attemptId}`,
};

// TTL = 3x ping interval (client ping mỗi 30s → session expire sau 90s không ping)
export const ATTEMPT_SESSION_TTL = 90;
