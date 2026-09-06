import { decrypt } from "../encryption";
import { logger } from "../logger";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "./types";
import type { WorkspaceWithConfig } from "../types";

const CTX = "providers:index";

export function getProvider(workspace: WorkspaceWithConfig): LLMProvider {
  const { llm_provider, llm_base_url, llm_api_key_encrypted, llm_model } =
    workspace;

  if (!llm_api_key_encrypted) {
    throw new Error("AI provider not configured: no API key set");
  }

  let apiKey: string;
  try {
    apiKey = decrypt(llm_api_key_encrypted);
  } catch {
    logger.error(CTX, "Failed to decrypt API key", {
      workspaceId: workspace.id,
      provider: llm_provider,
    });
    throw new Error("Failed to decrypt API key");
  }

  logger.info(CTX, "Creating provider", {
    workspaceId: workspace.id,
    provider: llm_provider,
    baseUrl: llm_base_url,
    model: llm_model,
  });

  return new OpenAICompatibleProvider(llm_provider, llm_base_url, apiKey);
}
