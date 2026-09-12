"use client";

import type { SlashCommand } from "./commands";

export default function SlashCommandMenu({
  id,
  commands,
  activeIndex,
  onSelect,
  onHover,
}: {
  id: string;
  commands: SlashCommand[];
  activeIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}) {
  if (commands.length === 0) return null;

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-md overflow-hidden rounded-md border border-line bg-elevated py-1"
    >
      {commands.map((command, index) => {
        const active = index === activeIndex;
        return (
          <button
            key={command.name}
            id={`${id}-${command.name}`}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              // Complete without blurring the textarea first.
              e.preventDefault();
              onSelect(command);
            }}
            onMouseEnter={() => onHover(index)}
            className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm focus:outline-none ${
              active ? "bg-hover" : ""
            }`}
          >
            <span className="shrink-0 font-mono font-semibold text-accent">
              /{command.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted">
              {command.description}
            </span>
            <span className="hidden shrink-0 font-mono text-xs text-disabled sm:block">
              {command.usage}
            </span>
          </button>
        );
      })}
    </div>
  );
}
