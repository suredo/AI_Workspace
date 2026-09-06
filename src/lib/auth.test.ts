import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JWT } from "next-auth/jwt";
import type { Session } from "next-auth";
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

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { authorize, jwtCallback, sessionCallback } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

describe("authorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createClient as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ from: mockFrom })
    );
    mockFrom.mockImplementation(() => ({ select: mockSelect }));
    mockSelect.mockImplementation(() => ({ eq: mockEq }));
    mockEq.mockImplementation(() => ({ single: mockSingle }));
  });

  it("returns null for missing credentials", async () => {
    const result = await authorize(undefined);
    expect(result).toBeNull();
  });

  it("returns null for missing password", async () => {
    const result = await authorize({ email: "test@example.com" });
    expect(result).toBeNull();
  });

  it("returns null when user not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const result = await authorize({
      email: "nonexistent@example.com",
      password: "password123",
    });

    expect(result).toBeNull();
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

    const result = await authorize({
      email: "test@example.com",
      password: "wrongpassword",
    });

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

    const result = await authorize({
      email: "test@example.com",
      password: "correctpassword",
    });

    expect(result).toEqual({
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("normalizes email before lookup", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    await authorize({
      email: "  Test@Example.COM  ",
      password: "password123",
    });

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

    const result = await authorize({
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toBeNull();
  });

  it("returns null on Supabase query error", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "No rows found" },
    });

    const result = await authorize({
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toBeNull();
  });

  it("returns null on Supabase connection error", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Connection refused");
    });

    const result = await authorize({
      email: "test@example.com",
      password: "password123",
    });

    expect(result).toBeNull();
  });
});

describe("callbacks", () => {
  it("jwt callback sets userId from user.id", async () => {
    const result = await jwtCallback({
      token: { sub: "old-token" } as JWT,
      user: { id: "user-123" },
    });

    expect(result.userId).toBe("user-123");
  });

  it("jwt callback keeps existing token when no user", async () => {
    const result = await jwtCallback({
      token: { sub: "old-token", userId: "existing" } as JWT,
      user: null,
    });

    expect(result.userId).toBe("existing");
  });

  it("session callback sets user.id from token.userId", async () => {
    const result = await sessionCallback({
      session: { user: { id: "old-id", name: "Test", email: null, image: null }, expires: "2099-01-01" } as Session,
      token: { userId: "user-123" } as JWT,
    });

    expect(result.user!.id).toBe("user-123");
  });

  it("session callback handles missing session.user", async () => {
    const result = await sessionCallback({
      session: { expires: "2099-01-01" } as Session,
      token: { userId: "user-123" } as JWT,
    });

    expect(result).toBeDefined();
    expect(result.user).toBeUndefined();
  });
});
