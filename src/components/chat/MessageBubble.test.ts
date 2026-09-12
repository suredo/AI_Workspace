import { describe, expect, it } from "vitest";
import type { MessageWithSender } from "@/lib/types";
import { findQuoteAuthor, splitReply } from "./MessageBubble";

function makeMessage(
  overrides: Partial<MessageWithSender> & { id: string; content: string }
): MessageWithSender {
  return {
    workspace_id: "ws-1",
    sender_id: "user-1",
    role: "user",
    model: null,
    cost_cents: null,
    reasoning: null,
    created_at: new Date().toISOString(),
    display_name: "Ada",
    ...overrides,
  };
}

describe("splitReply", () => {
  it("returns null for plain messages", () => {
    expect(splitReply("Hello world")).toBeNull();
    expect(splitReply("")).toBeNull();
  });

  it("parses attributed replies", () => {
    expect(
      splitReply("> **Replying to Ada**\n> hello there\n\nmy answer")
    ).toEqual({ author: "Ada", excerpt: "hello there", body: "my answer" });
  });

  it("parses multi-line excerpts", () => {
    expect(
      splitReply("> **Replying to Ada**\n> line one\n> line two\n\nbody")
    ).toEqual({ author: "Ada", excerpt: "line one\nline two", body: "body" });
  });

  it("falls back to generic header for unattributed quotes", () => {
    expect(splitReply("> some quote\n\nmy take")).toEqual({
      author: null,
      excerpt: "some quote",
      body: "my take",
    });
  });

  it("returns null for quote-only messages", () => {
    expect(splitReply("> just a quote")).toBeNull();
    expect(splitReply("> **Replying to Ada**\n> hi")).toBeNull();
  });

  it("requires a body after the quote run", () => {
    expect(splitReply("> quote\n\n   \n")).toBeNull();
  });
});

describe("findQuoteAuthor", () => {
  const aiMessage = makeMessage({
    id: "m-ai",
    sender_id: null,
    role: "assistant",
    display_name: "AI Assistant",
    content: "Here is a long explanation of memory versus RAG.",
  });
  const userMessage = makeMessage({
    id: "m-user",
    display_name: "Ada",
    content: "Has anyone tried the hybrid approach?",
  });

  it("matches teammates by excerpt", () => {
    expect(
      findQuoteAuthor(
        "Has anyone tried the hybrid approach?",
        [aiMessage, userMessage],
        "m-reply"
      )
    ).toBe("Ada");
  });

  it("matches the AI by excerpt", () => {
    expect(
      findQuoteAuthor(
        "memory versus RAG",
        [aiMessage, userMessage],
        "m-reply"
      )
    ).toBe("AI Assistant");
  });

  it("matches truncated excerpts inside longer messages", () => {
    expect(
      findQuoteAuthor("long explanation", [aiMessage], "m-reply")
    ).toBe("AI Assistant");
  });

  it("ignores whitespace differences", () => {
    expect(
      findQuoteAuthor("hybrid   approach?", [userMessage], "m-reply")
    ).toBe("Ada");
  });

  it("excludes the message itself", () => {
    expect(findQuoteAuthor("hybrid approach?", [userMessage], "m-user")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(
      findQuoteAuthor("something nobody said", [aiMessage, userMessage], "m-reply")
    ).toBeNull();
    expect(findQuoteAuthor("", [aiMessage], "m-reply")).toBeNull();
    expect(findQuoteAuthor("   ", [aiMessage], "m-reply")).toBeNull();
  });
});
