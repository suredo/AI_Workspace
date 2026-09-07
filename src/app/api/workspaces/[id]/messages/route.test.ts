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
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetProvider = vi.fn();
vi.mock("@/lib/providers", () => ({
  getProvider: (...args: unknown[]) => mockGetProvider(...args),
}));

function createMockSupabase() {
  return { from: vi.fn() };
}

function mockSingle(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const secondEq = vi.fn().mockReturnValue({ single });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  return {
    select: vi.fn().mockReturnValue({ eq: firstEq }),
  };
}

function mockSingleEq(data: unknown, error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

const TEST_WORKSPACE = {
  id: "ws-123",
  name: "Study Group",
  owner_id: "user-123",
  system_prompt: "You are helpful.",
  llm_provider: "groq",
  llm_base_url: "https://api.groq.com/openai/v1",
  llm_api_key_encrypted: "encrypted-key",
  llm_model: "llama-3.3-70b-versatile",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const TEST_MEMBERSHIP = {
  id: "mem-1",
  role: "member",
  daily_cap_cents: 500,
};

function mockSpend(data: { cost_cents: number | null }[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function mockHistory(data: { role: string; content: string }[]) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data, error: null }),
        }),
      }),
    }),
  };
}

function mockInsertUser() {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
}

function mockInsertAi(id = "msg-ai") {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
      }),
    }),
  };
}

async function readStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

describe("GET /api/workspaces/[id]/messages", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  });

  it("returns paginated messages with sender names", async () => {
    const messages = [
      {
        id: "msg-1",
        workspace_id: "ws-123",
        sender_id: "user-123",
        role: "user",
        content: "Hello",
        model: null,
        cost_cents: null,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "msg-2",
        workspace_id: "ws-123",
        sender_id: null,
        role: "assistant",
        content: "Hi there",
        model: "llama-3.3-70b-versatile",
        cost_cents: 0,
        created_at: "2026-01-01T00:01:00Z",
      },
    ];

    mockFrom = vi.fn()
      .mockReturnValueOnce(mockSingle({ id: "mem-1" }, null))
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockResolvedValue({ data: messages, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [{ id: "user-123", display_name: "Test User" }],
            error: null,
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const { GET } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages?limit=50&offset=0"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].display_name).toBe("Test User");
    expect(body.messages[1].display_name).toBe("AI Assistant");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when not a member", async () => {
    mockFrom = vi.fn().mockReturnValue(
      mockSingle(null, { message: "Not found" })
    );
    mockSupabase.from = mockFrom;

    const { GET } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });
});

describe("POST /api/workspaces/[id]/messages", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    mockGetProvider.mockReset();
  });

  function setupSuccessFlow(opts?: {
    membership?: typeof TEST_MEMBERSHIP;
    workspace?: typeof TEST_WORKSPACE;
    spend?: { cost_cents: number | null }[];
    history?: { role: string; content: string }[];
    stream?: () => AsyncGenerator<{ type: string; content?: string }>;
  }) {
    const membership = opts?.membership ?? TEST_MEMBERSHIP;
    const workspace = opts?.workspace ?? TEST_WORKSPACE;
    const spend = opts?.spend ?? [{ cost_cents: 0 }];
    const history = opts?.history ?? [{ role: "user", content: "Hello" }];

    mockGetProvider.mockReturnValue({
      name: "groq",
      sendMessage: vi.fn(),
      sendMessageStream: opts?.stream ??
        (async function* () {
          yield { type: "token", content: "Hi " };
          yield { type: "token", content: "there" };
          yield { type: "done" };
        }),
    });

    mockFrom = vi.fn()
      .mockReturnValueOnce(mockSingle(membership, null))
      .mockReturnValueOnce(mockSingleEq(workspace, null))
      .mockReturnValueOnce(mockSpend(spend))
      .mockReturnValueOnce(mockInsertUser())
      .mockReturnValueOnce(mockHistory(history))
      .mockReturnValueOnce(mockInsertAi());
    mockSupabase.from = mockFrom;
  }

  it("streams tokens and inserts user + AI messages", async () => {
    setupSuccessFlow();

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello AI" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const text = await readStream(response);
    expect(text).toContain("event: token");
    expect(text).toContain('"content":"Hi "');
    expect(text).toContain('"content":"there"');
    expect(text).toContain("event: done");
    expect(text).toContain('"messageId":"msg-ai"');

    // 6 supabase calls: membership, workspace, spend, insert user, history, insert AI
    expect(mockFrom).toHaveBeenCalledTimes(6);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "workspace_members");
    expect(mockFrom).toHaveBeenNthCalledWith(4, "messages");
    expect(mockFrom).toHaveBeenNthCalledWith(6, "messages");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when not a member", async () => {
    mockFrom = vi.fn().mockReturnValue(
      mockSingle(null, { message: "Not found" })
    );
    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 400 when no API key configured", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce(mockSingle(TEST_MEMBERSHIP, null))
      .mockReturnValueOnce(
        mockSingleEq({ ...TEST_WORKSPACE, llm_api_key_encrypted: null }, null)
      );
    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("AI provider not configured");
  });

  it("returns 400 for empty content", async () => {
    mockFrom = vi.fn().mockReturnValueOnce(
      mockSingle(TEST_MEMBERSHIP, null)
    );
    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "   " }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Message content is required");
  });

  it("returns 400 for content over the limit", async () => {
    mockFrom = vi.fn().mockReturnValueOnce(
      mockSingle(TEST_MEMBERSHIP, null)
    );
    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x".repeat(10001) }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("10000 characters or less");
  });

  it("returns 429 when over the daily cap", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce(mockSingle(TEST_MEMBERSHIP, null))
      .mockReturnValueOnce(mockSingleEq(TEST_WORKSPACE, null))
      .mockReturnValueOnce(mockSpend([{ cost_cents: 500 }]));
    mockSupabase.from = mockFrom;

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe(
      "You've reached your daily limit of $5.00. Resets tomorrow."
    );
  });

  it("emits an error event when the provider fails", async () => {
    setupSuccessFlow({
      stream: async function* () {
        yield {
          type: "error",
          error: { code: "rate_limit", message: "Rate limit exceeded", retryable: true },
        };
      },
    });

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    const text = await readStream(response);
    expect(text).toContain("event: error");
    expect(text).toContain("Rate limit exceeded");
    expect(text).not.toContain("event: done");
  });

  it("strips thinking blocks from streamed content", async () => {
    setupSuccessFlow({
      stream: async function* () {
        yield { type: "token", content: "<think>\nsecret reasoning\n</think>\n" };
        yield { type: "token", content: "Hello!" };
        yield { type: "done" };
      },
    });

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hi" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    const text = await readStream(response);
    expect(text).not.toContain("secret reasoning");
    expect(text).not.toContain("<think>");
    expect(text).toContain('"content":"Hello!"');
    expect(text).toContain("event: done");
  });
});

describe("createThinkingFilter", () => {
  it("strips a complete block and keeps surrounding text", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("Hello <think>reasoning</think> world")).toBe(
      "Hello  world"
    );
    expect(filter("", true)).toBe("");
  });

  it("handles tags split across chunks", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<th")).toBe("");
    expect(filter("ink>hidden</th")).toBe("");
    expect(filter("ink>Hi", true)).toBe("Hi");
  });

  it("handles case-insensitive and thinking variants", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<THINKING>deep thought</THINKING>Answer", true)).toBe(
      "Answer"
    );
  });

  it("drops unclosed blocks at flush", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<think>never closed", true)).toBe("");
  });

  it("preserves literal angle brackets and drops stray closes", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("2 < 3 and a </think> stray", true)).toBe(
      "2 < 3 and a  stray"
    );
  });
});
