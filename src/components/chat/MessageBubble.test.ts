import { describe, expect, it } from "vitest";
import { splitReply } from "./MessageBubble";

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
