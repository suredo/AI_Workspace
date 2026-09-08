import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET, PUT, DELETE } from "@/app/api/workspaces/[id]/route";

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
    // Owners see daily caps.
    expect(body.workspace.members[0].daily_cap_cents).toBe(500);
  });

  it("nulls daily caps when the requester is a regular member", async () => {
    const workspace = {
      id: "ws-123",
      name: "Study Group",
      owner_id: "user-999",
      system_prompt: "You are helpful.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const membership = {
      id: "mem-2",
      role: "member",
      daily_cap_cents: 500,
      joined_at: "2026-01-01T00:00:00Z",
    };

    const members = [
      {
        id: "mem-1",
        user_id: "user-999",
        role: "owner",
        daily_cap_cents: 1000,
        joined_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "mem-2",
        user_id: "user-123",
        role: "member",
        daily_cap_cents: 500,
        joined_at: "2026-01-01T00:00:00Z",
      },
    ];

    const users = [
      {
        id: "user-999",
        display_name: "Owner User",
        email: "owner@example.com",
      },
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
    expect(body.workspace.members).toHaveLength(2);
    // Regular members see no caps at all — not even their own (issue #61).
    expect(body.workspace.members[0].daily_cap_cents).toBeNull();
    expect(body.workspace.members[1].daily_cap_cents).toBeNull();
    // Names and roles are still visible.
    expect(body.workspace.members[0].display_name).toBe("Owner User");
    expect(body.workspace.members[1].role).toBe("member");
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

function makePutRequest(body: unknown) {
  return new Request("http://localhost:3000/api/workspaces/ws-123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest() {
  return new Request("http://localhost:3000/api/workspaces/ws-123", {
    method: "DELETE",
  });
}

describe("PUT /api/workspaces/[id]", () => {
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

  it("updates workspace name for owner", async () => {
    const membership = { id: "mem-1", role: "owner" };
    const updatedWorkspace = {
      id: "ws-123",
      name: "Updated Name",
      owner_id: "user-123",
      system_prompt: "You are helpful.",
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedWorkspace, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ name: "Updated Name" });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.name).toBe("Updated Name");
  });

  it("updates system prompt for admin", async () => {
    const membership = { id: "mem-1", role: "admin" };
    const updatedWorkspace = {
      id: "ws-123",
      name: "Study Group",
      owner_id: "user-456",
      system_prompt: "New system prompt.",
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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedWorkspace, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ system_prompt: "New system prompt." });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace.system_prompt).toBe("New system prompt.");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = makePutRequest({ name: "Test" });
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

    const request = makePutRequest({ name: "Test" });
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

    const request = makePutRequest({ name: "Test" });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 for empty name", async () => {
    const membership = { id: "mem-1", role: "owner" };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ name: "   " });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Workspace name cannot be empty");
  });

  it("returns 400 for name exceeding max length", async () => {
    const membership = { id: "mem-1", role: "owner" };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ name: "x".repeat(101) });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("100 characters or less");
  });

  it("returns 400 for empty system prompt", async () => {
    const membership = { id: "mem-1", role: "owner" };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ system_prompt: "   " });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("System prompt cannot be empty");
  });

  it("returns 400 when no valid fields provided", async () => {
    const membership = { id: "mem-1", role: "owner" };

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: membership, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({});
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("No valid fields to update");
  });

  it("returns 500 on update failure", async () => {
    const membership = { id: "mem-1", role: "owner" };

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
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makePutRequest({ name: "Test" });
    const response = await PUT(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to update workspace");
  });
});

describe("DELETE /api/workspaces/[id]", () => {
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

  it("deletes workspace for owner", async () => {
    const membership = { id: "mem-1", role: "owner" };

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
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makeDeleteRequest();
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = makeDeleteRequest();
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
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

    const request = makeDeleteRequest();
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 403 when not owner", async () => {
    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "admin" }, error: null }),
            }),
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makeDeleteRequest();
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Forbidden");
  });

  it("returns 500 on delete failure", async () => {
    const membership = { id: "mem-1", role: "owner" };

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
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
        }),
      });

    mockSupabase.from = mockFrom;

    const request = makeDeleteRequest();
    const response = await DELETE(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to delete workspace");
  });
});
