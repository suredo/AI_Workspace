import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const CTX = "api:workspaces:invitations";
const INVITATION_EXPIRY_DAYS = 7;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  logger.info(CTX, "POST request received", { workspaceId });

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = await createClient();

  // Check user is owner or admin
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    logger.warn(CTX, "User is not a member", { workspaceId, userId });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    logger.warn(CTX, "User is not owner or admin", {
      workspaceId,
      userId,
      role: membership.role,
    });
    return NextResponse.json({ error: "Only owners and admins can create invitations" }, { status: 403 });
  }

  // Create invitation with 7-day expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .insert({
      workspace_id: workspaceId,
      created_by: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (inviteError) {
    logger.error(CTX, "Failed to create invitation", { error: inviteError.message });
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }

  logger.info(CTX, "Invitation created", {
    invitationId: invitation.id,
    workspaceId,
  });

  return NextResponse.json({ invitation }, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  logger.info(CTX, "GET request received", { workspaceId });

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = await createClient();

  // Check user is a member
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    logger.warn(CTX, "User is not a member", { workspaceId, userId });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Fetch pending invitations (not accepted and not expired)
  const { data: invitations, error: inviteError } = await supabase
    .from("invitations")
    .select(`
      *,
      users:created_by (display_name)
    `)
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (inviteError) {
    logger.error(CTX, "Failed to fetch invitations", { error: inviteError.message });
    return NextResponse.json({ error: "Failed to fetch invitations" }, { status: 500 });
  }

  const result = (invitations || []).map(
    (inv: {
      id: string;
      workspace_id: string;
      token: string;
      created_by: string;
      created_at: string;
      expires_at: string;
      accepted_at: string | null;
      users: { display_name: string } | null;
    }) => ({
      id: inv.id,
      workspace_id: inv.workspace_id,
      token: inv.token,
      created_by: inv.created_by,
      created_at: inv.created_at,
      expires_at: inv.expires_at,
      accepted_at: inv.accepted_at,
      created_by_name: inv.users?.display_name || "Unknown",
    })
  );

  logger.info(CTX, "Invitations fetched", {
    workspaceId,
    count: result.length,
  });

  return NextResponse.json({ invitations: result });
}
