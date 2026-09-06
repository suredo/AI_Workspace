import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimit, getRateLimitStore } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Clear all entries
    const store = getRateLimitStore();
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  it("allows first request", () => {
    const result = checkRateLimit("test:1", { windowMs: 60_000, maxRequests: 5 });
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it("allows requests within limit", () => {
    const config = { windowMs: 60_000, maxRequests: 3 };
    checkRateLimit("test:2", config);
    checkRateLimit("test:2", config);
    const result = checkRateLimit("test:2", config);
    expect(result.allowed).toBe(true);
  });

  it("blocks requests over limit", () => {
    const config = { windowMs: 60_000, maxRequests: 2 };
    checkRateLimit("test:3", config);
    checkRateLimit("test:3", config);
    const result = checkRateLimit("test:3", config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    checkRateLimit("test:a", config);
    const result = checkRateLimit("test:b", config);
    expect(result.allowed).toBe(true);
  });

  it("resets after window expires", async () => {
    vi.useFakeTimers();
    const config = { windowMs: 100, maxRequests: 1 };

    checkRateLimit("test:expire", config);
    const blocked = checkRateLimit("test:expire", config);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(101);

    const after = checkRateLimit("test:expire", config);
    expect(after.allowed).toBe(true);

    vi.useRealTimers();
  });

  it("resetRateLimit clears a specific key", () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    checkRateLimit("test:reset", config);
    const blocked = checkRateLimit("test:reset", config);
    expect(blocked.allowed).toBe(false);

    resetRateLimit("test:reset");

    const after = checkRateLimit("test:reset", config);
    expect(after.allowed).toBe(true);
  });
});
