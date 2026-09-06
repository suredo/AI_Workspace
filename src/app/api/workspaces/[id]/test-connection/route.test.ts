import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { getProvider } from "@/lib/providers";

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

vi.mock("@/lib/providers", () => ({
  getProvider: vi.fn(),
}));

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("POST /api/workspaces/[id]/test-connection", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com" },
    });
  });

  it("returns success with valid config", async () => {
    const mockSendMessage = vi.fn().mockResolvedValue("Hello!");

    vi.mocked(getProvider).mockReturnValue({
      name: "groq",
      sendMessage: mockSendMessage,
      sendMessageStream: async function* () {
        yield { type: "token", content: "Hello!" };
        yield { type: "done" };
      },
    });

    const workspaceConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

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
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Say hello in one word." }],
      })
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

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
    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
          }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

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
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

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
    const workspaceConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: null,
      llm_model: "llama-3.3-70b-versatile",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

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
    const mockSendMessage = vi.fn().mockRejectedValue({
      code: "auth_failure",
      message: "Invalid API key",
      retryable: false,
    });

    vi.mocked(getProvider).mockReturnValue({
      name: "groq",
      sendMessage: mockSendMessage,
      sendMessageStream: async function* () {
        yield { type: "error", error: { code: "auth_failure", message: "Invalid API key", retryable: false } };
      },
    });

    const workspaceConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

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
    const mockSendMessage = vi.fn().mockRejectedValue({
      code: "rate_limit",
      message: "Rate limit exceeded",
      retryable: true,
    });

    vi.mocked(getProvider).mockReturnValue({
      name: "groq",
      sendMessage: mockSendMessage,
      sendMessageStream: async function* () {
        yield { type: "error", error: { code: "rate_limit", message: "Rate limit exceeded", retryable: true } };
      },
    });

    const workspaceConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

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

  it("returns 500 when provider creation fails", async () => {
    vi.mocked(getProvider).mockImplementation(() => {
      throw new Error("Failed to decrypt API key");
    });

    const workspaceConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "llama-3.3-70b-versatile",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspaceConfig, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/test-connection/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/test-connection"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("provider_init_failed");
    expect(body.error.message).toBe("Failed to initialize provider");
  });
});