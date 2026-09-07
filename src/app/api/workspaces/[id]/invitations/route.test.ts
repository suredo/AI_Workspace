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

function mockMembership(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const secondEq = vi.fn().mockReturnValue({ single });
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
  return {
    select: vi.fn().mockReturnValue({ eq: firstEq }),
  };
}

function mockInsert(data: unknown, error: unknown = null) {
  return {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

function mockInvitationList(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error }),
          }),
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

const TEST_INVITATION = {
  id: "inv-1",
  workspace_id: "ws-123",
  token: "tok-abc",
  created_by: "user-123",
  created_at: "2026-01-01T00:00:00Z",
  expires_at: "2026-01-08T00:00:00Z",
  accepted_at: null,
};

function makeRequest(method = "GET") {
  return new Request("http://localhost:3000/api/workspaces/ws-123/invitations", {
    method,
  });
}

describe("POST /api/workspaces/[id]/invitations", () => {
  let mockSupabase: { from: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  });

  it("creates an invitation for the owner", async () => {
    mockSupabase.from = vi.fn()
      .mockReturnValueOnce(mockMembership({ role: "owner" }, null))
      .mockReturnValueOnce(mockInsert(TEST_INVITATION, null));

    const { POST } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invitation.id).toBe("inv-1");
  });

  it("creates an invitation for an admin", async () => {
    mockSupabase.from = vi.fn()
      .mockReturnValueOnce(mockMembership({ role: "admin" }, null))
      .mockReturnValueOnce(mockInsert(TEST_INVITATION, null));

    const { POST } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "ws-123" }),
    });

    expect(response.status).toBe(201);
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { POST } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when not a member", async () => {
    mockSupabase.from = vi.fn().mockReturnValue(
      mockMembership(null, { message: "Not found" })
    );

    const { POST } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 403 for a plain member", async () => {
    mockSupabase.from = vi.fn().mockReturnValue(
      mockMembership({ role: "member" }, null)
    );

    const { POST } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await POST(makeRequest("POST"), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only owners and admins can create invitations");
  });
});

describe("GET /api/workspaces/[id]/invitations", () => {
  let mockSupabase: { from: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { from: vi.fn() };
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  });

  it("lists invitations with creator names for an admin", async () => {
    mockSupabase.from = vi.fn()
      .mockReturnValueOnce(mockMembership({ id: "mem-1", role: "admin" }, null))
      .mockReturnValueOnce(mockInvitationList([TEST_INVITATION], null))
      .mockReturnValueOnce(
        mockUsers([{ id: "user-123", display_name: "Alice" }])
      );

    const { GET } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0].created_by_name).toBe("Alice");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { GET } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when not a member", async () => {
    mockSupabase.from = vi.fn().mockReturnValue(
      mockMembership(null, { message: "Not found" })
    );

    const { GET } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Workspace not found");
  });

  it("returns 403 for a plain member", async () => {
    mockSupabase.from = vi.fn().mockReturnValue(
      mockMembership({ id: "mem-9", role: "member" }, null)
    );

    const { GET } = await import("@/app/api/workspaces/[id]/invitations/route");
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ id: "ws-123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Only owners and admins can view invitations");
  });
});
