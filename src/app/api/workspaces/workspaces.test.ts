import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { POST, GET } from "@/app/api/workspaces/route";

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

function makePostRequest(body: unknown) {
  return new Request("http://localhost:3000/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("POST /api/workspaces", () => {
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

  it("creates a workspace with valid input", async () => {
    const workspace = {
      id: "ws-123",
      name: "Study Group",
      owner_id: "user-123",
      system_prompt: "You are a helpful AI assistant.",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    const mockInsertSingle = vi.fn().mockResolvedValue({ data: workspace, error: null });

    mockFrom = vi.fn().mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: mockInsertSingle,
        }),
      }),
    });
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation(() => ({
        then: (resolve: (val: { error: null }) => void) => resolve({ error: null }),
      })),
    });

    mockSupabase.from = mockFrom;

    const request = makePostRequest({ name: "Study Group" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.workspace.name).toBe("Study Group");
    expect(body.workspace.id).toBe("ws-123");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = makePostRequest({ name: "Test" });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for missing name", async () => {
    const request = makePostRequest({});
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Workspace name is required");
  });

  it("returns 400 for empty name after trim", async () => {
    const request = makePostRequest({ name: "   " });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Workspace name cannot be empty");
  });

  it("returns 400 for name exceeding max length", async () => {
    const request = makePostRequest({ name: "x".repeat(101) });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("100 characters or less");
  });

  it("returns 500 on workspace creation failure", async () => {
    mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "Database error" } }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const request = makePostRequest({ name: "Test" });
    const response = await POST(request);

    expect(response.status).toBe(500);
  });

  it("cleans up workspace if member insert fails", async () => {
    const workspace = { id: "ws-123", name: "Test" };

    // First call: workspaces insert succeeds
    mockFrom = vi.fn().mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: workspace, error: null }),
        }),
      }),
    });
    // Second call: workspace_members insert fails
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation(() => ({
        then: (resolve: (val: { error: { message: string } }) => void) =>
          resolve({ error: { message: "Member insert failed" } }),
      })),
    });
    // Third call: delete cleanup
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    mockSupabase.from = mockFrom;

    const request = makePostRequest({ name: "Test" });
    const response = await POST(request);

    expect(response.status).toBe(500);
    expect(mockFrom).toHaveBeenLastCalledWith("workspaces");
  });

  it("trims whitespace from workspace name", async () => {
    const workspace = { id: "ws-123", name: "Trimmed" };
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: workspace, error: null }),
      }),
    });

    mockFrom = vi.fn().mockReturnValueOnce({
      insert: mockInsert,
    });
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockImplementation(() => ({
        then: (resolve: (val: { error: null }) => void) => resolve({ error: null }),
      })),
    });

    mockSupabase.from = mockFrom;

    const request = makePostRequest({ name: "  Trimmed  " });
    await POST(request);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Trimmed" })
    );
  });
});

describe("GET /api/workspaces", () => {
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

  it("returns empty array when user has no workspaces", async () => {
    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });
    mockSupabase.from = mockFrom;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaces).toEqual([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns workspaces where user is a member", async () => {
    const memberships = [
      { workspace_id: "ws-1" },
      { workspace_id: "ws-2" },
    ];

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: memberships, error: null }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: "ws-1",
                name: "Workspace 1",
                workspace_members: [{ user_id: "user-123" }, { user_id: "user-456" }],
              },
              {
                id: "ws-2",
                name: "Workspace 2",
                workspace_members: [{ user_id: "user-123" }],
              },
            ],
            error: null,
          }),
        }),
      });

    mockSupabase.from = mockFrom;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspaces).toHaveLength(2);
    expect(body.workspaces[0].member_count).toBe(2);
    expect(body.workspaces[1].member_count).toBe(1);
  });

  it("returns 500 on membership fetch failure", async () => {
    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: "Database error" } }),
      }),
    });
    mockSupabase.from = mockFrom;

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
