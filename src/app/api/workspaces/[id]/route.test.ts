import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET } from "@/app/api/workspaces/[id]/route";

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

function makeGetRequest() {
  return new Request("http://localhost:3000/api/workspaces/ws-123");
}

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("GET /api/workspaces/[id]", () => {
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

  it("returns workspace details for member", async () => {
    const workspace = {
      id: "ws-123",
      name: "Study Group",
      owner_id: "user-123",
      system_prompt: "You are helpful.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const membership = {
      id: "mem-1",
      role: "owner",
      daily_cap_cents: 500,
      joined_at: "2026-01-01T00:00:00Z",
    };

    const members = [
      {
        id: "mem-1",
        user_id: "user-123",
        role: "owner",
        daily_cap_cents: 500,
        joined_at: "2026-01-01T00:00:00Z",
      },
    ];

    const users = [
      {
        id: "user-123",
        display_name: "Test User",
        email: "test@example.com",
      },
    ];

    mockFrom = vi.fn()
      // Membership check
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      })
      // Workspace fetch
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspace, error: null }),
          }),
        }),
      })
      // Members fetch
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: members, error: null }),
        }),
      })
      // Users fetch
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: users, error: null }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makeGetRequest();
    const response = await GET(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.name).toBe("Study Group");
    expect(body.workspace.members).toHaveLength(1);
    expect(body.workspace.current_user_membership.role).toBe("owner");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = makeGetRequest();
    const response = await GET(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when user is not a member", async () => {
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

    const request = makeGetRequest();
    const response = await GET(request, { params: Promise.resolve({ id: "ws-not-mine" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 404 when workspace does not exist", async () => {
    const membership = {
      id: "mem-1",
      role: "member",
      daily_cap_cents: 500,
      joined_at: "2026-01-01T00:00:00Z",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const request = makeGetRequest();
    const response = await GET(request, { params: Promise.resolve({ id: "ws-deleted" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 500 on members fetch failure", async () => {
    const membership = {
      id: "mem-1",
      role: "member",
      daily_cap_cents: 500,
      joined_at: "2026-01-01T00:00:00Z",
    };
    const workspace = {
      id: "ws-123",
      name: "Test",
      owner_id: "user-456",
      system_prompt: "prompt",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: workspace, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      });
    mockSupabase.from = mockFrom;

    const request = makeGetRequest();
    const response = await GET(request, { params: Promise.resolve({ id: "ws-123" }) });

    expect(response.status).toBe(500);
  });
});
