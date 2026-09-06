import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner, errorResponse } from "@/lib/api/workspace-auth";

const CTX = "api:workspaces:test-connection";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logger.info(CTX, "POST request received");

  const { id } = await params;

  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase } = authResult;

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
      {
        success: false,
        error: { code: "not_configured", message: "AI provider not configured: no API key set" },
      },
      { status: 400 }
    );
  }

  let provider;
  try {
    provider = getProvider(workspace);
  } catch (e) {
    logger.error(CTX, "Failed to create provider", { error: String(e) });
    return NextResponse.json(
      { success: false, error: { code: "provider_init_failed", message: "Failed to initialize provider" } },
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