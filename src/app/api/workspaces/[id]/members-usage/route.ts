import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  requireWorkspaceOwner,
  errorResponse,
} from "@/lib/api/workspace-auth";

const CTX = "api:workspaces:[id]:members-usage";

function todayUtcMidnightIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "GET request received", { workspaceId: id });

  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }
  const { supabase } = authResult;

  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("id, user_id, daily_cap_cents")
    .eq("workspace_id", id);

  if (membersError) {
    logger.error(CTX, "Failed to fetch members", {
      error: membersError.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }

  const { data: spendRows, error: spendError } = await supabase
    .from("messages")
    .select("sender_id, cost_cents")
    .eq("workspace_id", id)
    .gte("created_at", todayUtcMidnightIso());

  if (spendError) {
    logger.error(CTX, "Failed to fetch usage", {
      error: spendError.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch usage" },
      { status: 500 }
    );
  }

  const spendBySender = new Map<string, number>();
  for (const row of (spendRows || []) as {
    sender_id: string | null;
    cost_cents: number | null;
  }[]) {
    if (!row.sender_id) continue;
    spendBySender.set(
      row.sender_id,
      (spendBySender.get(row.sender_id) ?? 0) + (row.cost_cents ?? 0)
    );
  }

  const usage = ((members || []) as {
    id: string;
    user_id: string;
    daily_cap_cents: number;
  }[]).map((m) => {
    const usedCents = spendBySender.get(m.user_id) ?? 0;
    return {
      member_id: m.id,
      user_id: m.user_id,
      used_cents: usedCents,
      cap_cents: m.daily_cap_cents,
      remaining_cents: Math.max(m.daily_cap_cents - usedCents, 0),
    };
  });

  return NextResponse.json({ usage });
}
