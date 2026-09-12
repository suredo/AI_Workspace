import { describe, expect, it } from "vitest";
import { filterCommands, findCommand, SLASH_COMMANDS } from "./commands";
import { parseComposer } from "./MessageInput";

describe("filterCommands", () => {
  it("returns all commands for an empty query", () => {
    expect(filterCommands("").map((c) => c.name)).toEqual(
      SLASH_COMMANDS.map((c) => c.name)
    );
  });

  it("prefix-filters case-insensitively", () => {
    expect(filterCommands("a").map((c) => c.name)).toEqual(["ai"]);
    expect(filterCommands("H").map((c) => c.name)).toEqual(["help"]);
    expect(filterCommands("zzz")).toEqual([]);
  });
});

describe("findCommand", () => {
  it("resolves names case-insensitively", () => {
    expect(findCommand("AI")?.usage).toBe("/ai <question>");
    expect(findCommand("help")?.takesArgs).toBe(false);
    expect(findCommand("nope")).toBeUndefined();
  });
});

describe("registry consistency", () => {
  it("every registry command parses through the composer", () => {
    for (const command of SLASH_COMMANDS) {
      const input = command.takesArgs ? `/${command.name} some args` : `/${command.name}`;
      expect(parseComposer(input).kind).toBe(command.name);
    }
  });
});
