import { NextResponse } from "next/server";
import { encrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import type { WorkspaceConfig } from "@/lib/types";
import { requireWorkspaceOwner, errorResponse } from "@/lib/api/workspace-auth";

const CTX = "api:workspaces:config";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logger.info(CTX, "GET request received");

  const { id } = await params;

  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase } = authResult;

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("llm_provider, llm_base_url, llm_api_key_encrypted, llm_model")
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

  const config: WorkspaceConfig = {
    llm_provider: workspace.llm_provider,
    llm_base_url: workspace.llm_base_url,
    llm_api_key_set: !!workspace.llm_api_key_encrypted,
    llm_model: workspace.llm_model,
  };

  logger.info(CTX, "Config fetched", { workspaceId: id });
  return NextResponse.json({ config });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  logger.info(CTX, "PUT request received");

  const { id } = await params;

  const authResult = await requireWorkspaceOwner(id);
  if ("error" in authResult) {
    return errorResponse(authResult);
  }

  const { supabase } = authResult;

  let body: {
    llm_provider?: string;
    llm_base_url?: string;
    llm_api_key?: string;
    llm_model?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { llm_provider, llm_base_url, llm_api_key, llm_model } = body;

  if (!llm_provider || !llm_base_url || !llm_model) {
    return NextResponse.json(
      { error: "llm_provider, llm_base_url, and llm_model are required" },
      { status: 400 }
    );
  }

  try {
    new URL(llm_base_url);
  } catch {
    return NextResponse.json(
      { error: "llm_base_url must be a valid URL" },
      { status: 400 }
    );
  }

  let llm_api_key_encrypted: string | null = null;
  if (llm_api_key && llm_api_key.trim()) {
    llm_api_key_encrypted = encrypt(llm_api_key.trim());
  }

  const updates: Record<string, string | null> = {
    llm_provider,
    llm_base_url,
    llm_model,
  };

  if (llm_api_key_encrypted !== null) {
    updates.llm_api_key_encrypted = llm_api_key_encrypted;
  }

  const { data: workspace, error: updateError } = await supabase
    .from("workspaces")
    .update(updates)
    .eq("id", id)
    .select("llm_provider, llm_base_url, llm_api_key_encrypted, llm_model")
    .single();

  if (updateError || !workspace) {
    logger.error(CTX, "Failed to update workspace config", {
      error: updateError?.message,
    });
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }

  const config: WorkspaceConfig = {
    llm_provider: workspace.llm_provider,
    llm_base_url: workspace.llm_base_url,
    llm_api_key_set: !!workspace.llm_api_key_encrypted,
    llm_model: workspace.llm_model,
  };

  logger.info(CTX, "Config updated", { workspaceId: id });
  return NextResponse.json({ config });
}