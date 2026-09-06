import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { Workspace } from "@/lib/types";

const CTX = "api:workspaces";
const MAX_WORKSPACE_NAME_LENGTH = 100;
const MIN_WORKSPACE_NAME_LENGTH = 1;

export async function POST(request: Request) {
  logger.info(CTX, "POST request received");

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    logger.warn(CTX, "Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
  }

  const trimmedName = name.trim();
  if (trimmedName.length < MIN_WORKSPACE_NAME_LENGTH) {
    return NextResponse.json({ error: "Workspace name cannot be empty" }, { status: 400 });
  }
  if (trimmedName.length > MAX_WORKSPACE_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or less` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .insert({ name: trimmedName, owner_id: userId })
    .select()
    .single();

  if (workspaceError) {
    logger.error(CTX, "Failed to create workspace", { error: workspaceError.message });
    return NextResponse.json({ error: "Failed to create workspace" }, { status: 500 });
  }

  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: "owner",
      daily_cap_cents: 500,
    });

  if (memberError) {
    logger.error(CTX, "Failed to add owner as member", { error: memberError.message });
    await supabase.from("workspaces").delete().eq("id", workspace.id);
    return NextResponse.json({ error: "Failed to set up workspace" }, { status: 500 });
  }

  logger.info(CTX, "Workspace created", {
    workspaceId: workspace.id,
    name: trimmedName,
  });

  return NextResponse.json({ workspace }, { status: 201 });
}

export async function GET() {
  logger.info(CTX, "GET request received");

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const supabase = await createClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId);

  if (membershipError) {
    logger.error(CTX, "Failed to fetch memberships", { error: membershipError.message });
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ workspaces: [] });
  }

  const workspaceIds = memberships.map((m: { workspace_id: string }) => m.workspace_id);

  const { data: workspaces, error: workspaceError } = await supabase
    .from("workspaces")
    .select(`
      *,
      workspace_members!inner(user_id)
    `)
    .in("id", workspaceIds);

  if (workspaceError) {
    logger.error(CTX, "Failed to fetch workspaces", { error: workspaceError.message });
    return NextResponse.json({ error: "Failed to fetch workspaces" }, { status: 500 });
  }

  const result = (workspaces || []).map(
    (w: Workspace & { workspace_members: { user_id: string }[] }) => ({
      ...w,
      member_count: w.workspace_members.length,
    })
  );

  logger.info(CTX, "Workspaces fetched", { count: result.length });

  return NextResponse.json({ workspaces: result });
}
