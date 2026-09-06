import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const CTX = "api:invitations:info";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  logger.info(CTX, "GET request received");

  const supabase = await createClient();

  // Fetch invitation
  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .select("workspace_id, expires_at, accepted_at, created_by")
    .eq("token", token)
    .single();

  if (inviteError || !invitation) {
    logger.warn(CTX, "Invalid invitation token");
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invitation has expired" }, { status: 410 });
  }

  // Check if already accepted
  if (invitation.accepted_at) {
    return NextResponse.json({ error: "Invitation has already been accepted" }, { status: 410 });
  }

  // Fetch workspace name
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", invitation.workspace_id)
    .single();

  // Fetch creator name
  const { data: creator } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", invitation.created_by)
    .single();

  return NextResponse.json({
    workspace_name: workspace?.name || "Unknown Workspace",
    workspace_id: invitation.workspace_id,
    created_by_name: creator?.display_name || "Unknown",
    expires_at: invitation.expires_at,
  });
}
