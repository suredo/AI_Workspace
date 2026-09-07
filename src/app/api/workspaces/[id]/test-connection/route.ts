import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner, errorResponse } from "@/lib/api/workspace-auth";
import { decrypt } from "@/lib/encryption";

const CTX = "api:workspaces:test-connection";

interface TestConnectionBody {
  llm_provider?: string;
  llm_base_url?: string;
  llm_api_key?: string;
  llm_model?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logger.info(CTX, "POST request received");

  const { id } = await params;

  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase } = authResult;

  // Parse request body for optional inline config (for testing before save)
  let body: TestConnectionBody = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional - fall back to DB config
  }

  // Fetch workspace config from DB (fallback)
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

  // Merge inline config (from request body) with DB config
  // Inline config takes precedence for testing
  const providerName = body.llm_provider ?? workspace.llm_provider;
  const baseUrl = body.llm_base_url ?? workspace.llm_base_url;
  const model = body.llm_model ?? workspace.llm_model;

  // Determine API key: use inline if provided, otherwise decrypt from DB
  let apiKey: string;
  if (body.llm_api_key && body.llm_api_key.trim()) {
    apiKey = body.llm_api_key.trim();
  } else if (workspace.llm_api_key_encrypted) {
    try {
      apiKey = decrypt(workspace.llm_api_key_encrypted);
    } catch {
      return NextResponse.json(
        { success: false, error: { code: "decrypt_failed", message: "Failed to decrypt API key" } },
        { status: 500 }
      );
    }
  } else {
    logger.warn(CTX, "No API key configured", { workspaceId: id });
    return NextResponse.json(
      {
        success: false,
        error: { code: "not_configured", message: "AI provider not configured: no API key set" },
      },
      { status: 400 }
    );
  }

  // Create provider with merged config
  let provider;
  try {
    const { OpenAICompatibleProvider } = await import("@/lib/providers/openai-compatible");
    provider = new OpenAICompatibleProvider(providerName, baseUrl, apiKey);
  } catch (e) {
    logger.error(CTX, "Failed to create provider", { error: String(e) });
    return NextResponse.json(
      { success: false, error: { code: "provider_init_failed", message: "Failed to initialize provider" } },
      { status: 500 }
    );
  }

  const testRequest = {
    messages: [{ role: "user" as const, content: "Say hello in one word." }],
    model,
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
    model,
    response,
  });
}