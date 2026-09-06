import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";
import type { Session, User } from "next-auth";
import bcrypt from "bcryptjs";

type AuthRequest = {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  method?: string;
};

type AuthorizeFn = (
  credentials: Record<string, string> | undefined,
  req: AuthRequest
) => Promise<User | null>;

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

import { authOptions } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function getAuthorize() {
  const provider = authOptions.providers[0] as CredentialsConfig;
  return (provider.options as { authorize: AuthorizeFn }).authorize;
}

describe("authorize", () => {
  beforeEach(() => {
    // Re-establish chain (Vitest clearAllMocks resets implementations)
    (createClient as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({ from: mockFrom })
    );
    mockFrom.mockImplementation(() => ({ select: mockSelect }));
    mockSelect.mockImplementation(() => ({ eq: mockEq }));
    mockEq.mockImplementation(() => ({ single: mockSingle }));
  });

  it("returns null for missing credentials", async () => {
    const authorize = getAuthorize();
    const result = await authorize({ email: null, password: null } as unknown as Record<string, string>, {} as AuthRequest);
    expect(result).toBeNull();
  });

  it("returns null for missing password", async () => {
    const authorize = getAuthorize();
    const result = await authorize({ email: "test@example.com", password: null } as unknown as Record<string, string>, {} as AuthRequest);
    expect(result).toBeNull();
  });

  it("returns null when user not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "nonexistent@example.com", password: "password123" },
      {} as AuthRequest
    );

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

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "wrongpassword" },
      {} as AuthRequest
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
      {} as AuthRequest
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
      {} as AuthRequest
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
      {} as AuthRequest
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
      {} as AuthRequest
    );

    expect(result).toBeNull();
  });

  it("returns null on Supabase connection error", async () => {
    (createClient as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Connection refused");
    });

    const authorize = getAuthorize();
    const result = await authorize(
      { email: "test@example.com", password: "password123" },
      {} as AuthRequest
    );

    expect(result).toBeNull();
  });
});

describe("callbacks", () => {
  it("jwt callback sets userId from user.id", async () => {
    const jwtCallback = authOptions.callbacks!.jwt as (params: {
      token: JWT;
      user: User | null;
      account: null;
      profile: undefined;
      trigger: "signIn";
    }) => JWT;

    const result = await jwtCallback({
      token: { sub: "old-token" } as JWT,
      user: { id: "user-123", email: "test@example.com", name: null, image: null },
      account: null,
      profile: undefined,
      trigger: "signIn",
    });

    expect(result.userId).toBe("user-123");
  });

  it("jwt callback keeps existing token when no user", async () => {
    const jwtCallback = authOptions.callbacks!.jwt as (params: {
      token: JWT;
      user: User | null;
      account: null;
      profile: undefined;
      trigger: "signIn";
    }) => JWT;

    const result = await jwtCallback({
      token: { sub: "old-token", userId: "existing" } as JWT,
      user: null,
      account: null,
      profile: undefined,
      trigger: "signIn",
    });

    expect(result.userId).toBe("existing");
  });

  it("session callback sets user.id from token.userId", async () => {
    const sessionCallback = authOptions.callbacks!.session as (params: {
      session: Session;
      token: JWT;
      user: User;
      newSession: null;
      trigger: "update";
    }) => Session;

    const result = await sessionCallback({
      session: { user: { id: "old-id", name: "Test", email: null, image: null }, expires: "2099-01-01" },
      token: { userId: "user-123" } as JWT,
      user: { id: "u1", email: "test@test.com", name: null, image: null },
      newSession: null,
      trigger: "update",
    });

    expect(result.user.id).toBe("user-123");
  });

  it("session callback handles missing session.user", async () => {
    const sessionCallback = authOptions.callbacks!.session as (params: {
      session: Session;
      token: JWT;
      user: User;
      newSession: null;
      trigger: "update";
    }) => Session;

    const result = await sessionCallback({
      session: { expires: "2099-01-01" } as Session,
      token: { userId: "user-123" } as JWT,
      user: { id: "u1", email: "test@test.com", name: null, image: null },
      newSession: null,
      trigger: "update",
    });

    expect(result).toBeDefined();
  });
});
