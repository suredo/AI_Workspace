import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner, errorResponse } from "@/lib/api/workspace-auth";

const CTX = "api:workspaces:[id]";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "GET request received", { workspaceId: id });

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = await createClient();

  // Check membership
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id, role, daily_cap_cents, joined_at")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    logger.warn(CTX, "User is not a member of this workspace", {
      workspaceId: id,
      userId,
    });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Fetch workspace details
  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .single();

  if (workspaceError || !workspace) {
    logger.error(CTX, "Failed to fetch workspace", { error: workspaceError?.message });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Fetch all members (no FK join — RLS blocks joined table access)
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, daily_cap_cents, joined_at")
    .eq("workspace_id", id);

  if (membersError) {
    logger.error(CTX, "Failed to fetch members", { error: membersError.message });
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

  // Batch-fetch user display names and emails
  const userIds = [...new Set((members || []).map((m) => m.user_id))];
  const userMap: Record<string, { display_name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from("users")
      .select("id, display_name, email")
      .in("id", userIds);
    if (users) {
      for (const u of users) {
        userMap[u.id] = { display_name: u.display_name, email: u.email };
      }
    }
  }

  const result = {
    ...workspace,
    current_user_membership: membership,
    members: (members || []).map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      daily_cap_cents: m.daily_cap_cents,
      joined_at: m.joined_at,
      display_name: userMap[m.user_id]?.display_name || "Unknown",
      email: userMap[m.user_id]?.email || "",
    })),
  };

  logger.info(CTX, "Workspace fetched", {
    workspaceId: id,
    memberCount: result.members.length,
  });

  return NextResponse.json({ workspace: result });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "PUT request received", { workspaceId: id });

  // Auth + ownership check (owner or admin)
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Allow owner or admin to update basic info
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; system_prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, system_prompt } = body;
  const updates: Record<string, string> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Workspace name cannot be empty" }, { status: 400 });
    }
    if (trimmed.length > 100) {
      return NextResponse.json({ error: "Workspace name must be 100 characters or less" }, { status: 400 });
    }
    updates.name = trimmed;
  }

  if (system_prompt !== undefined) {
    const trimmed = system_prompt.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "System prompt cannot be empty" }, { status: 400 });
    }
    updates.system_prompt = trimmed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: workspace, error: updateError } = await supabase
    .from("workspaces")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateError || !workspace) {
    logger.error(CTX, "Failed to update workspace", { error: updateError?.message });
    return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
  }

  logger.info(CTX, "Workspace updated", { workspaceId: id, fields: Object.keys(updates) });
  return NextResponse.json({ workspace });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "DELETE request received", { workspaceId: id });

  // Only owner can delete workspace
  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase } = authResult;

  // Delete workspace (cascades to members, messages, invitations via FK)
  const { error } = await supabase.from("workspaces").delete().eq("id", id);

  if (error) {
    logger.error(CTX, "Failed to delete workspace", { error: error.message });
    return NextResponse.json({ error: "Failed to delete workspace" }, { status: 500 });
  }

  logger.info(CTX, "Workspace deleted", { workspaceId: id });
  return NextResponse.json({ success: true });
}