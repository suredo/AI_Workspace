import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { LLMRequest } from "./types";

// Mock logger
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("OpenAICompatibleProvider", () => {
  const mockFetch = vi.fn();
  vi.stubGlobal("fetch", mockFetch);

  const provider = new OpenAICompatibleProvider(
    "test-provider",
    "https://api.example.com/v1",
    "test-api-key"
  );

  const baseRequest: LLMRequest = {
    messages: [{ role: "user", content: "Hello" }],
    model: "test-model",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("sendMessage", () => {
    it("should send message and return content", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Hi there!" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const result = await provider.sendMessage(baseRequest);

      expect(result).toBe("Hi there!");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          },
          body: JSON.stringify({
            model: "test-model",
            messages: [{ role: "user", content: "Hello" }],
            temperature: 0.7,
            max_tokens: undefined,
            stream: false,
          }),
        })
      );
    });

    it("should use custom temperature and maxTokens", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Response" }, finish_reason: "stop" }],
        }),
      });

      await provider.sendMessage({
        ...baseRequest,
        temperature: 0.2,
        maxTokens: 100,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.2);
      expect(body.max_tokens).toBe(100);
    });

    it("should throw on HTTP 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Unauthorized" } }),
      });

      await expect(provider.sendMessage(baseRequest)).rejects.toMatchObject({
        code: "auth_failure",
        message: "Invalid API key",
      });
    });

    it("should throw on HTTP 429", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: "Too many requests" } }),
      });

      await expect(provider.sendMessage(baseRequest)).rejects.toMatchObject({
        code: "rate_limit",
        retryable: true,
      });
    });

    it("should throw on HTTP 500", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      });

      await expect(provider.sendMessage(baseRequest)).rejects.toMatchObject({
        code: "server_error",
        retryable: true,
      });
    });

    it("should handle empty response body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const result = await provider.sendMessage(baseRequest);
      expect(result).toBe("");
    });
  });

  describe("sendMessageStream", () => {
    it("should yield token chunks from SSE stream", async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{"content":" world"},"finish_reason":null}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
        "data: [DONE]\n",
      ];

      const reader = {
        read: vi.fn(),
        releaseLock: vi.fn(),
      };

      let callCount = 0;
      reader.read.mockImplementation(async () => {
        if (callCount < chunks.length) {
          const chunk = new TextEncoder().encode(chunks[callCount]);
          callCount++;
          return { done: false, value: chunk };
        }
        return { done: true, value: undefined };
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => reader },
      });

      const stream = provider.sendMessageStream(baseRequest);
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: "token", content: "Hello" },
        { type: "token", content: " world" },
        { type: "done", finishReason: "stop" },
      ]);
    });

    it("should handle stream with no body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const stream = provider.sendMessageStream(baseRequest);
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toEqual([
        {
          type: "error",
          error: { code: "unknown", message: "No response body", retryable: false },
        },
      ]);
    });

    it("should yield error on HTTP failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Unauthorized" } }),
      });

      const stream = provider.sendMessageStream(baseRequest);
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toEqual([
        {
          type: "error",
          error: { code: "auth_failure", message: "Invalid API key", retryable: false },
        },
      ]);
    });

    it("should skip malformed JSON lines", async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n',
        "data: not-valid-json\n",
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
        "data: [DONE]\n",
      ];

      const reader = {
        read: vi.fn(),
        releaseLock: vi.fn(),
      };

      let callCount = 0;
      reader.read.mockImplementation(async () => {
        if (callCount < chunks.length) {
          const chunk = new TextEncoder().encode(chunks[callCount]);
          callCount++;
          return { done: false, value: chunk };
        }
        return { done: true, value: undefined };
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => reader },
      });

      const stream = provider.sendMessageStream(baseRequest);
      const results = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toEqual([
        { type: "token", content: "Hello" },
        { type: "done", finishReason: "stop" },
      ]);
    });
  });

  describe("error handling", () => {
    it("should parse error from response body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Invalid model" } }),
      });

      await expect(provider.sendMessage(baseRequest)).rejects.toMatchObject({
        code: "invalid_request",
        message: "Invalid model",
      });
    });

    it("should handle non-JSON error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("Not JSON");
        },
      });

      await expect(provider.sendMessage(baseRequest)).rejects.toMatchObject({
        code: "server_error",
        message: "HTTP 502",
      });
    });
  });
});
