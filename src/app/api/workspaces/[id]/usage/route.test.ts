import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET } from "@/app/api/workspaces/[id]/usage/route";

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

function createMockSupabase() {
  return { from: vi.fn() };
}

describe("GET /api/workspaces/[id]/usage", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  });

  it("returns used, cap, and remaining cents", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "mem-1", daily_cap_cents: 500 },
                error: null,
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [{ cost_cents: 120 }, { cost_cents: null }, { cost_cents: 60 }],
                error: null,
              }),
            }),
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usage).toEqual({
      used_cents: 180,
      cap_cents: 500,
      remaining_cents: 320,
    });
  });

  it("clamps remaining at zero when over the cap", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "mem-1", daily_cap_cents: 100 },
                error: null,
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [{ cost_cents: 250 }],
                error: null,
              }),
            }),
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.usage.used_cents).toBe(250);
    expect(body.usage.remaining_cents).toBe(0);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/usage"),
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
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
          }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 500 when the spend query fails", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "mem-1", daily_cap_cents: 500 },
                error: null,
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: null,
                error: { message: "DB error" },
              }),
            }),
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/usage"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );

    expect(response.status).toBe(500);
  });
});
