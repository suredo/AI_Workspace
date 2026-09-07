import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockDecrypt = vi.fn();
vi.mock("@/lib/encryption", () => ({
  decrypt: (...args: unknown[]) => mockDecrypt(...args),
}));

const mockRequireWorkspaceOwner = vi.fn();
vi.mock("@/lib/api/workspace-auth", () => ({
  requireWorkspaceOwner: (...args: unknown[]) => mockRequireWorkspaceOwner(...args),
  errorResponse: (e: { error: string; status: number }) =>
    new Response(JSON.stringify({ error: e.error }), {
      status: e.status,
      headers: { "Content-Type": "application/json" },
    }),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("POST /api/workspaces/[id]/test-connection", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockFetch.mockReset();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com" },
    });
    mockRequireWorkspaceOwner.mockReset();
    mockDecrypt.mockReset();

    // Default mock for requireWorkspaceOwner - returns success for owner
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: mockSupabase,
    });
    mockDecrypt.mockImplementation(() => "test-api-key");

    // Set up the supabase mock chain for workspace query
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "workspaces") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  function setupWorkspace(
    membershipRole: "owner" | "admin" | "member" = "owner",
    workspaceConfig: Record<string, unknown> = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    }
  ) {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: membershipRole },
      supabase: mockSupabase,
    });
    mockDecrypt.mockImplementation(() => "test-api-key");

    // Set up the supabase mock chain for workspace query
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "workspaces") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  }

  function mockFetchSuccess(response: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => response,
    });
  }

  function mockFetchError(status: number, errorBody: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: async () => errorBody,
    });
  }

  it("returns success with valid config from DB", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
      }),
    });

    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.response).toBe("Hello!");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        }),
      })
    );
  });

  it("returns success with inline API key from request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }],
      }),
    });

    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: null,
      llm_model: "llama-3.3-70b-versatile",
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llm_provider: "groq",
          llm_base_url: "https://api.groq.com/openai/v1",
          llm_api_key: "test-inline-key",
          llm_model: "llama-3.3-70b-versatile",
        }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.model).toBe("llama-3.3-70b-versatile");
    expect(body.response).toBe("Hello!");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-inline-key",
        }),
      })
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockRequireWorkspaceOwner.mockResolvedValue({ error: "Unauthorized", status: 401 });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when not a member", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({ error: "Workspace not found", status: 404 });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 403 when member but not owner", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({ error: "Forbidden", status: 403 });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when no API key configured", async () => {
    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: null,
      llm_model: "llama-3.3-70b-versatile",
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("not_configured");
    expect(body.error.message).toBe("AI provider not configured: no API key set");
  });

  it("returns 502 when provider authentication fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Unauthorized" } }),
    });

    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("auth_failure");
    expect(body.error.message).toBe("Invalid API key");
  });

  it("returns 502 when provider rate limited", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limit exceeded" } }),
    });

    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("rate_limit");
  });

  it("returns 500 when decrypt fails", async () => {
    setupWorkspace("owner", {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    });

    mockDecrypt.mockImplementation(() => {
      throw new Error("Failed to decrypt");
    });

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("decrypt_failed");
  });
});