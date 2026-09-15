/**
 * Single source of truth for slash commands: drives the composer menu,
 * the send-time parser, and the help notice.
 */
export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  /** Whether the command requires arguments to run. */
  takesArgs: boolean;
  /**
   * Composer kind this command dispatches to. Defaults to the command
   * name (e.g. "help"); aliases like "ask" override it to "ai".
   */
  kind?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "ai",
    description: "Ask the AI anything",
    usage: "/ai <question>",
    takesArgs: true,
  },
  {
    name: "ask",
    description: "Ask the AI anything (same as /ai)",
    usage: "/ask <question>",
    takesArgs: true,
    kind: "ai",
  },
  {
    name: "help",
    description: "Show available commands",
    usage: "/help",
    takesArgs: false,
  },
  {
    name: "find",
    description: "Find text in this thread",
    usage: "/find <text>",
    takesArgs: true,
  },
];

/** Prefix-filter commands by name (case-insensitive). Empty query matches all. */
export function filterCommands(query: string): SlashCommand[] {
  const needle = query.toLowerCase();
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(needle));
}

/** Look up a command by name (case-insensitive). */
export function findCommand(name: string): SlashCommand | undefined {
  const needle = name.toLowerCase();
  return SLASH_COMMANDS.find((cmd) => cmd.name === needle);
}
