import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const CTX = "api:invitations:accept";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  logger.info(CTX, "POST request received");

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = await createClient();

  // Find invitation by token
  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .single();

  if (inviteError || !invitation) {
    logger.warn(CTX, "Invalid invitation token");
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    logger.warn(CTX, "Invitation expired", { invitationId: invitation.id });
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  // Check if already accepted
  if (invitation.accepted_at) {
    logger.warn(CTX, "Invitation already accepted", { invitationId: invitation.id });
    return NextResponse.json({ error: "Invitation has already been accepted" }, { status: 410 });
  }

  // Check if user is already a member
  const { data: existingMember } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", invitation.workspace_id)
    .eq("user_id", userId)
    .single();

  if (existingMember) {
    logger.info(CTX, "User is already a member", {
      workspaceId: invitation.workspace_id,
      userId,
    });
    return NextResponse.json({
      message: "You are already a member of this workspace",
      workspace_id: invitation.workspace_id,
    });
  }

  // Add user as member
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: invitation.workspace_id,
      user_id: userId,
      role: "member",
      daily_cap_cents: 500,
    });

  if (memberError) {
    logger.error(CTX, "Failed to add member", { error: memberError.message });
    return NextResponse.json({ error: "Failed to join workspace" }, { status: 500 });
  }

  // Mark invitation as accepted
  const { error: updateError } = await supabase
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  if (updateError) {
    logger.error(CTX, "Failed to mark invitation as accepted", {
      error: updateError.message,
    });
    // Non-critical — user is already added
  }

  logger.info(CTX, "Invitation accepted", {
    invitationId: invitation.id,
    workspaceId: invitation.workspace_id,
    userId,
  });

  return NextResponse.json({
    message: "Successfully joined workspace",
    workspace_id: invitation.workspace_id,
  });
}
