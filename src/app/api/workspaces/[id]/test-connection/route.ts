import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/providers";
import { logger } from "@/lib/logger";

const CTX = "api:workspaces:test-connection";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logger.info(CTX, "POST request received");

  const session = await auth();
  if (!session?.user?.id) {
    logger.warn(CTX, "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id } = await params;

  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    logger.warn(CTX, "Workspace not found or not a member", { workspaceId: id });
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (membership.role !== "owner") {
    logger.warn(CTX, "Not owner", { workspaceId: id, role: membership.role });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .single();

  if (workspaceError || !workspace) {
    logger.error(CTX, "Failed to fetch workspace config", {
      error: workspaceError?.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }

  if (!workspace.llm_api_key_encrypted) {
    logger.warn(CTX, "No API key configured", { workspaceId: id });
    return NextResponse.json(
      { error: "AI provider not configured: no API key set" },
      { status: 400 }
    );
  }

  let provider;
  try {
    provider = getProvider(workspace);
  } catch (e) {
    logger.error(CTX, "Failed to create provider", { error: String(e) });
    return NextResponse.json(
      { error: "Failed to initialize provider" },
      { status: 500 }
    );
  }

  const testRequest = {
    messages: [{ role: "user" as const, content: "Say hello in one word." }],
    model: workspace.llm_model,
    temperature: 0.1,
    maxTokens: 10,
  };

  let response: string;
  try {
    response = await provider.sendMessage(testRequest);
  } catch (e) {
    const error = e as { code?: string; message?: string; retryable?: boolean };
    logger.warn(CTX, "Test connection failed", {
      error: error.message,
      code: error.code,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code ?? "unknown",
          message: error.message ?? "Test connection failed",
        },
      },
      { status: 502 },
    );
  }

  logger.info(CTX, "Test connection succeeded", { workspaceId: id });
  return NextResponse.json({
    success: true,
    model: workspace.llm_model,
    response,
  });
}