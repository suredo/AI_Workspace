import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export interface WorkspaceAuthResult {
  userId: string;
  membership: { role: "owner" | "admin" | "member" };
  supabase: Awaited<ReturnType<typeof createClient>>;
}

export interface WorkspaceAuthError {
  error: string;
  status: number;
}

export async function requireWorkspaceOwner(
  workspaceId: string
): Promise<WorkspaceAuthResult | WorkspaceAuthError> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }
  const userId = session.user.id;

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return { error: "Workspace not found", status: 404 };
  }

  if (membership.role !== "owner") {
    return { error: "Forbidden", status: 403 };
  }

  return {
    userId,
    membership: { role: membership.role },
    supabase,
  };
}

export function errorResponse(error: WorkspaceAuthError) {
  return NextResponse.json({ error: error.error }, { status: error.status });
}