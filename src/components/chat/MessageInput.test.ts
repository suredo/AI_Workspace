import { describe, expect, it } from "vitest";
import { parseComposer } from "./MessageInput";

describe("parseComposer", () => {
  it("treats plain text as chat", () => {
    expect(parseComposer("hello team")).toEqual({
      kind: "chat",
      text: "hello team",
    });
  });

  it("parses /ai with a prompt", () => {
    expect(parseComposer("/ai summarize this")).toEqual({
      kind: "ai",
      text: "/ai summarize this",
      command: "ai",
    });
  });

  it("treats bare /ai as unknown (usage error)", () => {
    expect(parseComposer("/ai")).toEqual({
      kind: "unknown",
      text: "/ai",
      command: "ai",
    });
    expect(parseComposer("/ai   ")).toMatchObject({
      kind: "unknown",
      command: "ai",
    });
  });

  it("parses /help", () => {
    expect(parseComposer("/help")).toEqual({
      kind: "help",
      text: "/help",
      command: "help",
    });
  });

  it("treats unknown commands as unknown", () => {
    expect(parseComposer("/dance now")).toEqual({
      kind: "unknown",
      text: "/dance now",
      command: "dance",
    });
  });

  it("does not treat mid-text slashes as commands", () => {
    expect(parseComposer("see /ai for details").kind).toBe("chat");
  });
});
