import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/register/route";

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockHash = vi.fn();
vi.mock("bcryptjs", () => ({
  default: {
    hash: (...args: unknown[]) => mockHash(...args),
  },
}));

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface MockSupabaseChain {
  from: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

function createMockSupabase(): MockSupabaseChain {
  const chain: MockSupabaseChain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
    insert: vi.fn(),
  };
  return chain;
}

describe("POST /api/auth/register", () => {
  let mockSupabase: MockSupabaseChain;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockHash.mockResolvedValue("$2a$12$hashedpassword");
  });

  it("creates a user with valid input", async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: null });
    mockSupabase.insert.mockResolvedValue({ error: null });

    const request = makeRequest({
      email: "new@example.com",
      password: "password123",
      displayName: "New User",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toBe("Account created successfully");
  });

  it("returns 400 for missing email", async () => {
    const request = makeRequest({
      password: "password123",
      displayName: "User",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details).toContain("Email is required");
  });

  it("returns 400 for invalid email format", async () => {
    const request = makeRequest({
      email: "notanemail",
      password: "password123",
      displayName: "User",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details).toContain("Invalid email format");
  });

  it("returns 400 for short password", async () => {
    const request = makeRequest({
      email: "test@example.com",
      password: "short",
      displayName: "User",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details).toContain("Password must be at least 8 characters");
  });

  it("returns 400 for missing display name", async () => {
    const request = makeRequest({
      email: "test@example.com",
      password: "password123",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.details).toContain("Display name is required");
  });

  it("returns 409 for duplicate email", async () => {
    mockSupabase.single.mockResolvedValue({
      data: { id: "existing-user" },
      error: null,
    });

    const request = makeRequest({
      email: "existing@example.com",
      password: "password123",
      displayName: "User",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("An account with this email already exists");
  });

  it("returns 409 on unique constraint violation", async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: null });
    mockSupabase.insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate key" },
    });

    const request = makeRequest({
      email: "race@example.com",
      password: "password123",
      displayName: "User",
    });

    const response = await POST(request);

    expect(response.status).toBe(409);
  });

  it("returns 500 on Supabase client creation failure", async () => {
    mockCreateClient.mockRejectedValue(new Error("Supabase connection failed"));

    const request = makeRequest({
      email: "test@example.com",
      password: "password123",
      displayName: "User",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("normalizes email to lowercase", async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: null });
    mockSupabase.insert.mockResolvedValue({ error: null });

    const request = makeRequest({
      email: "Test@Example.COM",
      password: "password123",
      displayName: "User",
    });

    await POST(request);

    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
      })
    );
  });
});
