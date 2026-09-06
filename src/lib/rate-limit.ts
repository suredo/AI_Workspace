// =============================================================================
// Rate Limiter — Minimal MVP
// =============================================================================
// Current implementation: in-memory, single-process, IP-based.
//
// Future improvements (tracked in GitHub Issue #TODO):
//   - Redis-backed store for multi-instance / serverless deployments
//   - Per-user rate limiting (requires auth lookup, add after login flow)
//   - Sliding window algorithm instead of fixed window
//   - Exponential backoff on repeated violations
//   - Account lockout after N failed attempts (PRD does not require this yet)
//   - Rate limit headers on all auth responses (X-RateLimit-Remaining, etc.)
//   - Configurable limits via environment variables
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  [key: string]: RateLimitEntry;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5,
};

const store: RateLimitStore = {};

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const key of Object.keys(store)) {
      if (store[key].resetAt <= now) {
        delete store[key];
      }
    }
  }, 60_000);
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store[key];

  if (!entry || entry.resetAt <= now) {
    store[key] = { count: 1, resetAt: now + config.windowMs };
    startCleanup();
    return { allowed: true, retryAfterMs: 0 };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    const retryAfterMs = entry.resetAt - now;
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function resetRateLimit(key: string): void {
  delete store[key];
}

export function getRateLimitStore(): RateLimitStore {
  return store;
}
