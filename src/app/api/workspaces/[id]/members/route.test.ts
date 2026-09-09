import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

const mockRequireWorkspaceOwner = vi.fn();
vi.mock("@/lib/api/workspace-auth", () => ({
  requireWorkspaceOwner: (...args: unknown[]) => mockRequireWorkspaceOwner(...args),
  errorResponse: (e: { error: string; status: number }) => new Response(JSON.stringify({ error: e.error }), { status: e.status, headers: { "Content-Type": "application/json" } }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("GET /api/workspaces/[id]/members", () => {
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

  it("returns members for member", async () => {
    const membership = { id: "mem-1", role: "member" };
    const members = [
      { id: "mem-1", user_id: "user-123", role: "owner", daily_cap_cents: 500, joined_at: "2026-01-01T00:00:00Z" },
      { id: "mem-2", user_id: "user-456", role: "member", daily_cap_cents: 500, joined_at: "2026-01-01T00:00:00Z" },
    ];
    const users = [
      { id: "user-123", display_name: "Owner User", email: "owner@example.com" },
      { id: "user-456", display_name: "Member User", email: "member@example.com" },
    ];

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
          eq: vi.fn().mockResolvedValue({ data: members, error: null }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: users, error: null }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { GET } = await import("@/app/api/workspaces/[id]/members/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toHaveLength(2);
    expect(body.members[0].role).toBe("owner");
    expect(body.members[0].display_name).toBe("Owner User");
    expect(body.members[1].role).toBe("member");
    expect(body.members[1].display_name).toBe("Member User");
    // Regular members see no daily caps (issue #61).
    expect(body.members[0].daily_cap_cents).toBeNull();
    expect(body.members[1].daily_cap_cents).toBeNull();
  });

  it("returns daily caps for owner and admin", async () => {
    const members = [
      { id: "mem-1", user_id: "user-123", role: "owner", daily_cap_cents: 1000, joined_at: "2026-01-01T00:00:00Z" },
      { id: "mem-2", user_id: "user-456", role: "member", daily_cap_cents: 500, joined_at: "2026-01-01T00:00:00Z" },
    ];
    const users = [
      { id: "user-123", display_name: "Owner User", email: "owner@example.com" },
      { id: "user-456", display_name: "Member User", email: "member@example.com" },
    ];

    for (const role of ["owner", "admin"]) {
      mockFrom = vi.fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: "mem-9", role }, error: null }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: members, error: null }),
          }),
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: users, error: null }),
          }),
        });

      mockSupabase.from = mockFrom;

      const { GET } = await import("@/app/api/workspaces/[id]/members/route");
      const response = await GET(
        new Request("http://localhost:3000/api/workspaces/ws-123/members"),
        { params: Promise.resolve({ id: "ws-123" }) }
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.members[0].daily_cap_cents).toBe(1000);
      expect(body.members[1].daily_cap_cents).toBe(500);
    }
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/workspaces/[id]/members/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members"),
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

    const { GET } = await import("@/app/api/workspaces/[id]/members/route");
    const response = await GET(
      new Request("http://localhost:3000/api/workspaces/ws-123/members"),
      { params: Promise.resolve({ id: "ws-123" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });
});

describe("PUT /api/workspaces/[id]/members", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com" },
    });
  });

  it("updates member role for owner", async () => {
    const updatedMember = {
      id: "mem-2",
      user_id: "user-456",
      role: "admin",
      daily_cap_cents: 500,
      joined_at: "2026-01-01T00:00:00Z",
    };
    const user = { display_name: "Member User", email: "member@example.com" };

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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedMember, error: null }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: user, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member.role).toBe("admin");
  });

  it("updates daily cap for admin", async () => {
    const updatedMember = {
      id: "mem-2",
      user_id: "user-456",
      role: "member",
      daily_cap_cents: 1000,
      joined_at: "2026-01-01T00:00:00Z",
    };
    const user = { display_name: "Member User", email: "member@example.com" };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedMember, error: null }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: user, error: null }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", daily_cap_cents: 1000 }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member.daily_cap_cents).toBe(1000);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
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

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 403 when member but not owner or admin", async () => {
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

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 for missing member_id", async () => {
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

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("member_id is required");
  });

  it("returns 400 for modifying yourself", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-self", user_id: "user-123", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-self", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot modify your own membership");
  });

  it("returns 404 for non-existent member", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-nonexistent", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Member not found");
  });

  it("returns 403 when non-owner tries to change role", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only owner can change roles");
  });

  it("returns 400 when trying to assign owner role", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", user_id: "user-456", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "owner" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot assign owner role");
  });

  it("returns 400 for invalid role", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", user_id: "user-456", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "superadmin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid role");
  });

  it("returns 400 for negative daily cap", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", daily_cap_cents: -100 }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Daily cap must be non-negative");
  });

  it("returns 400 for no valid fields", async () => {
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
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No valid fields to update");
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
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
              }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const { PUT } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: "mem-2", role: "admin" }),
    });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to update member");
  });
});

describe("DELETE /api/workspaces/[id]/members", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-123", name: "Test User", email: "test@example.com" },
    });
    mockRequireWorkspaceOwner.mockReset();
  });

  it("removes member for owner", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }) } as Record<string, unknown>
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-2", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);
    mockRequireWorkspaceOwner.mockResolvedValue({ error: "Unauthorized", status: 401 });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-2", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when not owner", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({ error: "Forbidden", status: 403 });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-2", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 for missing member_id", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn() } as Record<string, unknown>,
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("member_id is required");
  });

  it("returns 400 for removing yourself", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-self", user_id: "user-123", role: "member" }, error: null }),
            }),
          }),
        }),
      }) } as Record<string, unknown>,
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-self", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot remove yourself");
  });

  it("returns 404 for non-existent member", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
            }),
          }),
        }),
      }) } as Record<string, unknown>
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-nonexistent", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Member not found");
  });

  it("returns 400 for removing owner", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "owner" }, error: null }),
            }),
          }),
        }),
      }) } as Record<string, unknown>
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-2", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot remove workspace owner");
  });

  it("returns 500 on delete failure", async () => {
    mockRequireWorkspaceOwner.mockResolvedValue({
      userId: "user-123",
      membership: { role: "owner" },
      supabase: { from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "mem-2", role: "member" }, error: null }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
          }),
        }),
      }) } as Record<string, unknown>
    });

    const { DELETE } = await import("@/app/api/workspaces/[id]/members/route");
    const request = new Request("http://localhost:3000/api/workspaces/ws-123/members?member_id=mem-2", {
      method: "DELETE",
    });
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to remove member");
  });
});