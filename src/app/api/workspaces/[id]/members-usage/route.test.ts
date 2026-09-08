import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockRequireWorkspaceOwner = vi.fn();
vi.mock("@/lib/api/workspace-auth", () => ({
  requireWorkspaceOwner: (...args: unknown[]) =>
    mockRequireWorkspaceOwner(...args),
  errorResponse: (e: { error: string; status: number }) =>
    new Response(JSON.stringify({ error: e.error }), {
      status: e.status,
      headers: { "Content-Type": "application/json" },
    }),
}));

function createMockSupabase() {
  return { from: vi.fn() };
}

describe("GET /api/workspaces/[id]/members-usage", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockSupabase = createMockSupabase();
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: mockSupabase,
    });
  });

  function mockMembers(
    data: unknown,
    error: { message: string } | null = null
  ) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    };
  }

  function mockSpend(data: unknown, error: { message: string } | null = null) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    };
  }

  it("returns per-member usage, skipping assistant rows and clamping at zero", async () => {
    mockSupabase.from = vi
      .fn()
      .mockReturnValueOnce(
        mockMembers([
          { id: "mem-1", user_id: "user-123", daily_cap_cents: 500 },
          { id: "mem-2", user_id: "user-456", daily_cap_cents: 100 },
        ])
      )
      .mockReturnValueOnce(
        mockSpend([
          { sender_id: "user-123", cost_cents: 120 },
          { sender_id: "user-123", cost_cents: null },
          { sender_id: "user-456", cost_cents: 250 },
          { sender_id: null, cost_cents: 999 },
        ])
      );

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usage).toEqual([
      {
        member_id: "mem-1",
        user_id: "user-123",
        used_cents: 120,
        cap_cents: 500,
        remaining_cents: 380,
      },
      {
        member_id: "mem-2",
        user_id: "user-456",
        used_cents: 250,
        cap_cents: 100,
        remaining_cents: 0,
      },
    ]);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      error: "Unauthorized",
      status: 401,
    });

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when not the owner", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      error: "Forbidden",
      status: 403,
    });

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when workspace not found", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      error: "Workspace not found",
      status: 404,
    });

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 500 when the members query fails", async () => {
    mockSupabase.from = vi
      .fn()
      .mockReturnValueOnce(mockMembers(null, { message: "DB error" }));

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(500);
  });

  it("returns 500 when the spend query fails", async () => {
    mockSupabase.from = vi
      .fn()
      .mockReturnValueOnce(
        mockMembers([{ id: "mem-1", user_id: "user-123", daily_cap_cents: 500 }])
      )
      .mockReturnValueOnce(mockSpend(null, { message: "DB error" }));

    const { GET } = await import(
      "@/app/api/workspaces/[id]/members-usage/route"
    );
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members-usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(500);
  });
});
