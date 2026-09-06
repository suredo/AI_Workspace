import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { POST as createInvite } from "@/app/api/workspaces/[id]/invitations/route";
import { POST as acceptInvite } from "@/app/api/invitations/[token]/accept/route";

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

function createMockSupabase() {
  return {
    from: vi.fn(),
  };
}

describe("POST /api/workspaces/[id]/invitations", () => {
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

  it("creates invitation for owner", async () => {
    const invitation = {
      id: "inv-1",
      workspace_id: "ws-123",
      token: "token-abc",
      created_by: "user-123",
      created_at: "2026-01-01T00:00:00Z",
      expires_at: "2026-01-08T00:00:00Z",
      accepted_at: null,
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
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: invitation, error: null }),
          }),
        }),
      });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/workspaces/ws-123/invitations", {
      method: "POST",
    });
    const response = await createInvite(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invitation.token).toBe("token-abc");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/workspaces/ws-123/invitations", {
      method: "POST",
    });
    const response = await createInvite(request, { params: Promise.resolve({ id: "ws-123" }) });

    expect(response.status).toBe(401);
  });

  it("returns 403 for non-owner/non-admin", async () => {
    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { role: "member" }, error: null }),
          }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/workspaces/ws-123/invitations", {
      method: "POST",
    });
    const response = await createInvite(request, { params: Promise.resolve({ id: "ws-123" }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("owners and admins");
  });

  it("returns 404 for non-member", async () => {
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

    const request = new Request("http://localhost:3000/api/workspaces/ws-123/invitations", {
      method: "POST",
    });
    const response = await createInvite(request, { params: Promise.resolve({ id: "ws-123" }) });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/invitations/[token]/accept", () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;
  let mockFrom: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
    mockCreateClient.mockResolvedValue(mockSupabase);
    mockAuth.mockResolvedValue({
      user: { id: "user-456", name: "New User", email: "new@example.com" },
    });
  });

  it("accepts valid invitation", async () => {
    const invitation = {
      id: "inv-1",
      workspace_id: "ws-123",
      token: "valid-token",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
    };

    const mockSingle = vi.fn().mockResolvedValue({ data: invitation, error: null });

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    // Check existing membership
    const mockMemberSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockMemberEq2 = vi.fn().mockReturnValue({ single: mockMemberSingle });
    const mockMemberEq1 = vi.fn().mockReturnValue({ eq: mockMemberEq2 });

    mockFrom = vi.fn()
      // Find invitation
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
      })
      // Check existing membership
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: mockMemberEq1,
        }),
      })
      // Add member
      .mockReturnValueOnce({
        insert: mockInsert,
      })
      // Mark invitation accepted
      .mockReturnValueOnce({
        update: mockUpdate,
      });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/invitations/valid-token/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "valid-token" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.workspace_id).toBe("ws-123");
  });

  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const request = new Request("http://localhost:3000/api/invitations/token/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "token" }) });

    expect(response.status).toBe(401);
  });

  it("returns 404 for invalid token", async () => {
    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/invitations/bad-token/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "bad-token" }) });

    expect(response.status).toBe(404);
  });

  it("returns 410 for expired invitation", async () => {
    const invitation = {
      id: "inv-1",
      workspace_id: "ws-123",
      token: "expired-token",
      expires_at: new Date(Date.now() - 1000).toISOString(),
      accepted_at: null,
    };

    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: invitation, error: null }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/invitations/expired-token/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "expired-token" }) });

    expect(response.status).toBe(410);
  });

  it("returns 410 for already accepted invitation", async () => {
    const invitation = {
      id: "inv-1",
      workspace_id: "ws-123",
      token: "accepted-token",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: new Date().toISOString(),
    };

    mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: invitation, error: null }),
        }),
      }),
    });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/invitations/accepted-token/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "accepted-token" }) });

    expect(response.status).toBe(410);
  });

  it("returns message if already a member", async () => {
    const invitation = {
      id: "inv-1",
      workspace_id: "ws-123",
      token: "token-member",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at: null,
    };

    const mockSingle = vi.fn().mockResolvedValue({ data: invitation, error: null });

    // Check existing membership — returns a member
    const mockMemberSingle = vi.fn().mockResolvedValue({ data: { id: "existing" }, error: null });
    const mockMemberEq2 = vi.fn().mockReturnValue({ single: mockMemberSingle });
    const mockMemberEq1 = vi.fn().mockReturnValue({ eq: mockMemberEq2 });

    mockFrom = vi.fn()
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ single: mockSingle }),
        }),
      })
      .mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: mockMemberEq1,
        }),
      });
    mockSupabase.from = mockFrom;

    const request = new Request("http://localhost:3000/api/invitations/token-member/accept", {
      method: "POST",
    });
    const response = await acceptInvite(request, { params: Promise.resolve({ token: "token-member" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("already a member");
  });
});
