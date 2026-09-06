export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMStreamChunk {
  type: "token" | "done" | "error";
  content?: string;
  finishReason?: string;
  error?: LLMError;
}

export interface LLMError {
  code: "rate_limit" | "auth_failure" | "invalid_request" | "server_error" | "unknown";
  message: string;
  retryable: boolean;
}

export interface LLMProvider {
  name: string;
  sendMessage(request: LLMRequest): Promise<string>;
  sendMessageStream(request: LLMRequest): AsyncGenerator<LLMStreamChunk>;
}
