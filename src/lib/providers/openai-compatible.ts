import { logger } from "../logger";
import type {
  LLMProvider,
  LLMRequest,
  LLMStreamChunk,
  LLMError,
} from "./types";

const CTX = "providers:openai-compatible";

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface ChatCompletionChunk {
  choices: Array<{
    delta: { content?: string };
    finish_reason: string | null;
  }>;
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    public name: string,
    private baseUrl: string,
    private apiKey: string
  ) {
    logger.info(CTX, "Provider initialized", { name, baseUrl });
  }

  async sendMessage(request: LLMRequest): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      throw error;
    }

    const data: ChatCompletionResponse = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    logger.debug(CTX, "Message sent", {
      model: request.model,
      tokens: data.usage,
    });

    return content;
  }

  async *sendMessageStream(
    request: LLMRequest
  ): AsyncGenerator<LLMStreamChunk> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await this.parseError(response);
      yield { type: "error", error };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        type: "error",
        error: {
          code: "unknown",
          message: "No response body",
          retryable: false,
        },
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const chunk: ChatCompletionChunk = JSON.parse(data);
            const choice = chunk.choices?.[0];

            if (choice?.delta?.content) {
              yield {
                type: "token",
                content: choice.delta.content,
              };
            }

            if (choice?.finish_reason) {
              yield {
                type: "done",
                finishReason: choice.finish_reason,
              };
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async parseError(response: Response): Promise<LLMError> {
    let message = `HTTP ${response.status}`;
    let retryable = false;

    try {
      const body = await response.json();
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      // Use default message
    }

    let code: LLMError["code"] = "unknown";

    switch (response.status) {
      case 401:
        code = "auth_failure";
        message = "Invalid API key";
        break;
      case 429:
        code = "rate_limit";
        message = "Rate limit exceeded";
        retryable = true;
        break;
      case 400:
        code = "invalid_request";
        break;
      case 500:
      case 502:
      case 503:
        code = "server_error";
        retryable = true;
        break;
    }

    logger.error(CTX, "API error", {
      status: response.status,
      code,
      message,
    });

    return { code, message, retryable };
  }
}
