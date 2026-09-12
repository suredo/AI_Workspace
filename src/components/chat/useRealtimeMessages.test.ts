import { describe, expect, it } from "vitest";
import { resolveSenderName } from "./useRealtimeMessages";

const MEMBERS = [
  { user_id: "user-1", display_name: "Ada" },
  { user_id: "user-2", display_name: "Bob" },
];

describe("resolveSenderName", () => {
  it("returns AI Assistant for null senders", () => {
    expect(resolveSenderName(null, MEMBERS)).toBe("AI Assistant");
  });

  it("resolves member names", () => {
    expect(resolveSenderName("user-2", MEMBERS)).toBe("Bob");
  });

  it("falls back to Unknown for missing members", () => {
    expect(resolveSenderName("user-9", MEMBERS)).toBe("Unknown");
    expect(resolveSenderName("user-1", [])).toBe("Unknown");
  });
});
