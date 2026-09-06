import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { encrypt } from "@/lib/encryption";

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

vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn(),
}));

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("GET /api/workspaces/[id]/config", () => {
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

  it("returns config for workspace owner", async () => {
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

    const { GET } = await import("@/app/api/workspaces/[id]/config/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/config"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config).toEqual({
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_set: true,
      llm_model: "llama-3.3-70b-versatile",
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/workspaces/[id]/config/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/config"),
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

    const { GET } = await import("@/app/api/workspaces/[id]/config/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/config"),
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

    const { GET } = await import("@/app/api/workspaces/[id]/config/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/config"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns config with llm_api_key_set false when no key", async () => {
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

    const { GET } = await import("@/app/api/workspaces/[id]/config/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/config"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config.llm_api_key_set).toBe(false);
  });
});

describe("PUT /api/workspaces/[id]/config", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com" },
    });

    vi.mocked(encrypt).mockReturnValue("encrypted-key");
  });

  it("updates config with new API key", async () => {
    const updatedConfig = {
      llm_provider: "openai",
      llm_base_url: "https://api.openai.com/v1",
      llm_api_key_encrypted: "encrypted-key",
      llm_model: "gpt-4o-mini",
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedConfig, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "openai",
        llm_base_url: "https://api.openai.com/v1",
        llm_api_key: "sk-test123",
        llm_model: "gpt-4o-mini",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config).toEqual({
      llm_provider: "openai",
      llm_base_url: "https://api.openai.com/v1",
      llm_api_key_set: true,
      llm_model: "gpt-4o-mini",
    });
    expect(encrypt).toHaveBeenCalledWith("sk-test123");
  });

  it("updates config without changing API key", async () => {
    const updatedConfig = {
      llm_provider: "groq",
      llm_base_url: "https://api.groq.com/openai/v1",
      llm_api_key_encrypted: "existing-encrypted-key",
      llm_model: "llama-3.1-8b-instant",
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedConfig, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
        llm_model: "llama-3.1-8b-instant",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.config.llm_model).toBe("llama-3.1-8b-instant");
    expect(encrypt).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
        llm_model: "llama-3.3-70b-versatile",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
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

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
        llm_model: "llama-3.3-70b-versatile",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
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

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
        llm_model: "llama-3.3-70b-versatile",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 for missing required fields", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("llm_model");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not-valid-json",
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 500 on update failure", async () => {
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "Database error" } }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/config/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        llm_provider: "groq",
        llm_base_url: "https://api.groq.com/openai/v1",
        llm_model: "llama-3.3-70b-versatile",
      }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to update config");
  });
});