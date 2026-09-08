import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner, errorResponse } from "@/lib/api/workspace-auth";

const CTX = "api:workspaces:[id]:members";

async function getMembership(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string, userId: string) {
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();
  return membership;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "GET request received", { workspaceId: id });

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const membership = await getMembership(supabase, id, userId);
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, daily_cap_cents, joined_at")
    .eq("workspace_id", id);

  if (membersError) {
    logger.error(CTX, "Failed to fetch members", { error: membersError.message });
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }

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

  // Daily caps are only visible to owners and admins (see issue #61).
  const canSeeCaps =
    membership.role === "owner" || membership.role === "admin";

  const result = (members || []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    daily_cap_cents: canSeeCaps ? m.daily_cap_cents : null,
    joined_at: m.joined_at,
    display_name: userMap[m.user_id]?.display_name || "Unknown",
    email: userMap[m.user_id]?.email || "",
  }));

  return NextResponse.json({ members: result });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "PUT request received", { workspaceId: id });

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const membership = await getMembership(supabase, id, userId);
  if (!membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Only owner or admin can update members
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUserId = userId;

  let body: {
    member_id?: string;
    role?: string;
    daily_cap_cents?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { member_id, role, daily_cap_cents } = body;

  if (!member_id) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 });
  }

  const { data: targetMember, error: targetError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role")
    .eq("id", member_id)
    .eq("workspace_id", id)
    .single();

  if (targetError || !targetMember) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (targetMember.user_id === currentUserId) {
    return NextResponse.json({ error: "Cannot modify your own membership" }, { status: 400 });
  }

  // Owner role is immutable: it can never be assigned (single owner per workspace)
  if (role === "owner") {
    return NextResponse.json({ error: "Cannot assign owner role" }, { status: 400 });
  }

  // Only owner can change role
  if (role !== undefined) {
    if (role !== "admin" && role !== "member") {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (membership.role !== "owner") {
      return NextResponse.json({ error: "Only owner can change roles" }, { status: 403 });
    }

    if (targetMember.role === "owner") {
      return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
    }
  }

  const updates: Record<string, string | number> = {};
  if (role !== undefined) updates.role = role;
  if (daily_cap_cents !== undefined) {
    if (daily_cap_cents < 0) {
      return NextResponse.json({ error: "Daily cap must be non-negative" }, { status: 400 });
    }
    updates.daily_cap_cents = daily_cap_cents;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: updatedMember, error: updateError } = await supabase
    .from("workspace_members")
    .update(updates)
    .eq("id", member_id)
    .eq("workspace_id", id)
    .select("id, user_id, role, daily_cap_cents, joined_at")
    .single();

  if (updateError || !updatedMember) {
    logger.error(CTX, "Failed to update member", { error: updateError?.message });
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }

  const { data: user } = await supabase
    .from("users")
    .select("display_name, email")
    .eq("id", updatedMember.user_id)
    .single();

  return NextResponse.json({
    member: {
      ...updatedMember,
      display_name: user?.display_name || "Unknown",
      email: user?.email || "",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "DELETE request received", { workspaceId: id });

  // Only owner can remove members
  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase, userId: currentUserId } = authResult;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");

  if (!memberId) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 });
  }

  const { data: targetMember, error: targetError } = await supabase
    .from("workspace_members")
    .select("id, user_id, role")
    .eq("id", memberId)
    .eq("workspace_id", id)
    .single();

  if (targetError || !targetMember) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (targetMember.user_id === currentUserId) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  if (targetMember.role === "owner") {
    return NextResponse.json({ error: "Cannot remove workspace owner" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("id", memberId)
    .eq("workspace_id", id);

  if (error) {
    logger.error(CTX, "Failed to remove member", { error: error.message });
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }

  logger.info(CTX, "Member removed", { workspaceId: id, memberId });
  return NextResponse.json({ success: true });
}