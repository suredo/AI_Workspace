import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const CTX = "api:workspaces:[id]:usage";

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

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id, daily_cap_cents")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { data: spendRows, error: spendError } = await supabase
    .from("messages")
    .select("cost_cents")
    .eq("workspace_id", id)
    .eq("sender_id", userId)
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

  const usedCents = (spendRows || []).reduce(
    (sum: number, row: { cost_cents: number | null }) =>
      sum + (row.cost_cents ?? 0),
    0
  );
  const capCents = membership.daily_cap_cents as number;

  return NextResponse.json({
    usage: {
      used_cents: usedCents,
      cap_cents: capCents,
      remaining_cents: Math.max(capCents - usedCents, 0),
    },
  });
}
