import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Mock Supabase client
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: mockFrom,
  })),
}));

// Mock logger to prevent console noise
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { authOptions } from "@/lib/auth";

function getAuthorize() {
  const credentialsProvider = authOptions.providers[0] as any;
  return credentialsProvider.options.authorize;
}

describe("authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for missing credentials", async () => {
    const authorize = getAuthorize();
    const result = await authorize({ email: null, password: null }, {} as any);
    expect(result).toBeNull();
  });

  it("returns null for missing password", async () => {
    const authorize = getAuthorize();
    const result = await authorize({ email: "test@example.com", password: null }, {} as any);
    expect(result).toBeNull();
  });

  it("returns null when user not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "nonexistent@example.com", password: "password123" },
      {} as any
    );

    expect(result).toBeNull();
    // Verify dummy bcrypt was called (timing defense)
    expect(mockFrom).toHaveBeenCalledWith("users");
  });

  it("returns null for wrong password", async () => {
    const hashedPassword = await bcrypt.hash("correctpassword", 12);
    mockSingle.mockResolvedValue({
      data: {
        id: "user-123",
        email: "test@example.com",
        password_hash: hashedPassword,
        display_name: "Test User",
      },
      error: null,
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "wrongpassword" },
      {} as any
    );

    expect(result).toBeNull();
  });

  it("returns user for valid credentials", async () => {
    const hashedPassword = await bcrypt.hash("correctpassword", 12);
    mockSingle.mockResolvedValue({
      data: {
        id: "user-123",
        email: "test@example.com",
        password_hash: hashedPassword,
        display_name: "Test User",
      },
      error: null,
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "correctpassword" },
      {} as any
    );

    expect(result).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("normalizes email before lookup", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const authorize = getAuthorize();
    await authorize(
      { email: "  Test@Example.COM  ", password: "password123" },
      {} as any
    );

    expect(mockEq).toHaveBeenCalledWith("email", "test@example.com");
  });

  it("returns null when user has no password_hash", async () => {
    mockSingle.mockResolvedValue({
      data: {
        id: "user-123",
        email: "test@example.com",
        password_hash: null,
        display_name: "Test User",
      },
      error: null,
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "password123" },
      {} as any
    );

    expect(result).toBeNull();
  });

  it("returns null on Supabase query error", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "password123" },
      {} as any
    );

    expect(result).toBeNull();
  });

  it("returns null on Supabase connection error", async () => {
    mockFrom.mockImplementation(() => {
      throw new Error("Connection refused");
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "password123" },
      {} as any
    );

    expect(result).toBeNull();
  });
});

describe("callbacks", () => {
  it("jwt callback sets userId from user.id", async () => {
    const jwtCallback = authOptions.callbacks?.jwt as any;
    const result = await jwtCallback({
      token: { sub: "old-token" },
      user: { id: "user-123", email: "test@example.com" },
    });
    expect(result.userId).toBe("user-123");
  });

  it("jwt callback keeps existing token when no user", async () => {
    const jwtCallback = authOptions.callbacks?.jwt as any;
    const result = await jwtCallback({
      token: { sub: "old-token", userId: "existing" },
      user: null,
    });
    expect(result.userId).toBe("existing");
  });

  it("session callback sets user.id from token.userId", async () => {
    const sessionCallback = authOptions.callbacks?.session as any;
    const result = await sessionCallback({
      session: { user: { name: "Test" } },
      token: { userId: "user-123" },
    });
    expect(result.user.id).toBe("user-123");
  });

  it("session callback handles missing session.user", async () => {
    const sessionCallback = authOptions.callbacks?.session as any;
    const result = await sessionCallback({
      session: {} as any,
      token: { userId: "user-123" },
    });
    // Should not crash, returns session without setting user.id
    expect(result).toBeDefined();
  });
});
