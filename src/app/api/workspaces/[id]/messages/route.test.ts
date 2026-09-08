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

function mockHistory(data: { role: string; content: string; sender_id?: string | null }[]) {
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

function mockUsers(data: { id: string; display_name: string }[]) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data, error: null }),
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
        cost_cents: 42,
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
    // Per-message costs are never exposed in the chat feed (issue #59).
    expect(body.messages[0].cost_cents).toBeNull();
    expect(body.messages[1].cost_cents).toBeNull();
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
    history?: { role: string; content: string; sender_id?: string | null }[];
    users?: { id: string; display_name: string }[];
    stream?: () => AsyncGenerator<{ type: string; content?: string }>;
  }) {
    const membership = opts?.membership ?? TEST_MEMBERSHIP;
    const workspace = opts?.workspace ?? TEST_WORKSPACE;
    const spend = opts?.spend ?? [{ cost_cents: 0 }];
    const history = opts?.history ?? [
      { role: "user", content: "Hello", sender_id: "user-123" },
    ];
    const users = opts?.users ?? [
      { id: "user-123", display_name: "Test User" },
    ];

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
      .mockReturnValueOnce(mockUsers(users))
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

    // 7 supabase calls: membership, workspace, spend, insert user,
    // history, user names, insert AI
    expect(mockFrom).toHaveBeenCalledTimes(7);
    expect(mockFrom).toHaveBeenNthCalledWith(1, "workspace_members");
    expect(mockFrom).toHaveBeenNthCalledWith(4, "messages");
    expect(mockFrom).toHaveBeenNthCalledWith(6, "users");
    expect(mockFrom).toHaveBeenNthCalledWith(7, "messages");
  });

  it("prefixes user history with sender names and suffixes the system prompt", async () => {
    let captured: { messages: { role: string; content: string }[] } | null = null;
    setupSuccessFlow({
      // Newest-first, as the real query returns (the route reverses it).
      history: [
        { role: "assistant", content: "Yes.", sender_id: null },
        { role: "user", content: "Is it a function?", sender_id: "user-456" },
        { role: "user", content: "What is recursion?", sender_id: "user-123" },
      ],
      users: [
        { id: "user-123", display_name: "Alice" },
        { id: "user-456", display_name: "Bob" },
      ],
      stream: async function* () {
        yield { type: "token", content: "Hi" };
        yield { type: "done" };
      },
    });
    const provider = mockGetProvider();
    const origStream = provider.sendMessageStream;
    mockGetProvider.mockReturnValue({
      name: "groq",
      sendMessage: vi.fn(),
      sendMessageStream: async function* (req: unknown) {
        captured = req as typeof captured;
        yield* origStream();
      },
    });

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Thanks!" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    await readStream(response);

    expect(captured).not.toBeNull();
    const sent = captured!.messages;
    expect(sent[0].role).toBe("system");
    expect(sent[0].content).toContain("You are helpful.");
    expect(sent[0].content).toContain("[Alice]");
    expect(sent[1]).toEqual({
      role: "user",
      content: "[Alice]: What is recursion?",
    });
    expect(sent[2]).toEqual({
      role: "user",
      content: "[Bob]: Is it a function?",
    });
    // Assistant history passes through without a prefix.
    expect(sent[3]).toEqual({ role: "assistant", content: "Yes." });
  });

  it("falls back to Unknown when a sender name is missing", async () => {
    let captured: { messages: { role: string; content: string }[] } | null = null;
    setupSuccessFlow({
      history: [{ role: "user", content: "Hello?", sender_id: "user-999" }],
      users: [],
      stream: async function* () {
        yield { type: "token", content: "Hi" };
        yield { type: "done" };
      },
    });
    const provider = mockGetProvider();
    const origStream = provider.sendMessageStream;
    mockGetProvider.mockReturnValue({
      name: "groq",
      sendMessage: vi.fn(),
      sendMessageStream: async function* (req: unknown) {
        captured = req as typeof captured;
        yield* origStream();
      },
    });

    const { POST } = await import("@/app/api/workspaces/[id]/messages/route");
    const response = await POST(
      new Request("http://localhost:3000/api/workspaces/ws-123/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello?" }),
      }),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    await readStream(response);

    expect(captured!.messages[1]).toEqual({
      role: "user",
      content: "[Unknown]: Hello?",
    });
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
      "You've reached your daily limit. Resets tomorrow."
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

  it("separates thinking into reasoning events and saves it", async () => {
    let savedReasoning: unknown;
    let savedContent: unknown;
    const insertAi = vi.fn().mockImplementation((row: Record<string, unknown>) => {
      savedReasoning = row.reasoning;
      savedContent = row.content;
      return {
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "msg-ai" }, error: null }),
        }),
      };
    });

    mockGetProvider.mockReturnValue({
      name: "groq",
      sendMessage: vi.fn(),
      sendMessageStream: async function* () {
        yield { type: "token", content: "<think>secret reasoning</think>" };
        yield { type: "token", content: "Hello!" };
        yield { type: "done" };
      },
    });

    mockFrom = vi.fn()
      .mockReturnValueOnce(mockSingle(TEST_MEMBERSHIP, null))
      .mockReturnValueOnce(mockSingleEq(TEST_WORKSPACE, null))
      .mockReturnValueOnce(mockSpend([{ cost_cents: 0 }]))
      .mockReturnValueOnce(mockInsertUser())
      .mockReturnValueOnce(mockHistory([{ role: "user", content: "Hi" }]))
      .mockReturnValueOnce({ insert: insertAi });
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

    const text = await readStream(response);
    // Thinking travels in reasoning events, never in token payloads.
    expect(text).toContain("event: reasoning");
    expect(text).toContain("secret reasoning");
    expect(text).not.toContain('event: token\ndata: {"content":"secret');
    expect(text).not.toContain("<think>");
    expect(text).toContain('"content":"Hello!"');
    expect(text).toContain("event: done");
    // Answer stays clean and reasoning is persisted separately.
    expect(savedContent).toBe("Hello!");
    expect(savedReasoning).toBe("secret reasoning");
  });
});

describe("sender identity helpers", () => {
  it("sanitizes names that could break the [Name]: format", async () => {
    const { sanitizeSenderName } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    expect(sanitizeSenderName("Alice")).toBe("Alice");
    expect(sanitizeSenderName("[Bob]\nAdmin")).toBe("BobAdmin");
    expect(sanitizeSenderName("<Eve>")).toBe("Eve");
    expect(sanitizeSenderName("   ")).toBe("Unknown");
    expect(sanitizeSenderName("x".repeat(100))).toHaveLength(50);
  });

  it("prefixes user messages and passes assistant messages through", async () => {
    const { formatMessageForLLM } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    expect(formatMessageForLLM("user", "Hi", "Alice")).toEqual({
      role: "user",
      content: "[Alice]: Hi",
    });
    expect(formatMessageForLLM("user", "Hi", null)).toEqual({
      role: "user",
      content: "[Unknown]: Hi",
    });
    expect(formatMessageForLLM("assistant", "Hello!", null)).toEqual({
      role: "assistant",
      content: "Hello!",
    });
  });

  it("appends shared-thread instructions without mutating the base prompt", async () => {
    const { buildSystemPrompt } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const base = "You are helpful.";
    const withSender = buildSystemPrompt(base, "Alice");
    expect(withSender.startsWith(base)).toBe(true);
    expect(withSender).toContain("[Name]:");
    expect(withSender).toContain("[Alice]");
    const withoutSender = buildSystemPrompt(base, null);
    expect(withoutSender.startsWith(base)).toBe(true);
    expect(withoutSender).not.toContain("latest message is from");
  });
});

describe("createThinkingFilter", () => {
  it("strips a complete block and keeps surrounding text", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("Hello <think>reasoning</think> world")).toEqual({
      visible: "Hello  world",
      thinking: "reasoning",
    });
    expect(filter("", true)).toEqual({ visible: "", thinking: "" });
  });

  it("handles tags split across chunks", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<th")).toEqual({ visible: "", thinking: "" });
    expect(filter("ink>hidden</th")).toEqual({ visible: "", thinking: "" });
    expect(filter("ink>Hi", true)).toEqual({
      visible: "Hi",
      thinking: "hidden",
    });
  });

  it("handles case-insensitive and thinking variants", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<THINKING>deep thought</THINKING>Answer", true)).toEqual({
      visible: "Answer",
      thinking: "deep thought",
    });
  });

  it("drops unclosed blocks at flush", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("<think>never closed", true)).toEqual({
      visible: "",
      thinking: "never closed",
    });
  });

  it("preserves literal angle brackets and drops stray closes", async () => {
    const { createThinkingFilter } = await import(
      "@/app/api/workspaces/[id]/messages/route"
    );
    const filter = createThinkingFilter();
    expect(filter("2 < 3 and a </think> stray", true)).toEqual({
      visible: "2 < 3 and a  stray",
      thinking: "",
    });
  });
});
