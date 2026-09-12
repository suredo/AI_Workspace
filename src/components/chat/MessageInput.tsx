"use client";

import { useRef, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { filterCommands, findCommand, type SlashCommand } from "./commands";
import SlashCommandMenu from "./SlashCommandMenu";

export type ComposerKind = "chat" | "ai" | "help" | "unknown";

export interface ComposerPayload {
  kind: ComposerKind;
  /** Full text as typed (commands keep their prefix for a transparent record). */
  text: string;
  /** Command name without slash, when the input is a command. */
  command?: string;
}

/** Split composer text into plain chat or a /command payload. */
export function parseComposer(value: string): ComposerPayload {
  const text = value.trim();
  const match = /^\/(\w+)([\s\S]*)$/.exec(text);
  if (!match) return { kind: "chat", text };
  const name = match[1].toLowerCase();
  const rest = match[2];
  const command = findCommand(name);
  if (!command) return { kind: "unknown", text, command: name };
  if (command.takesArgs && !rest.trim()) {
    return { kind: "unknown", text, command: name };
  }
  return { kind: command.name as ComposerKind, text, command: name };
}

export default function MessageInput({
  onSend,
  sending,
  capReached,
}: {
  onSend: (payload: ComposerPayload) => void;
  sending: boolean;
  capReached: boolean;
}) {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last query the menu was synced for: arrow-key caret moves re-fire
  // keyup/click syncs, which must not reset the highlight.
  const menuQueryRef = useRef("");

  const trimmed = value.trim();
  const disabled = sending || capReached || trimmed.length === 0;
  const filtered = filterCommands(menuQuery);
  const menuVisible = menuOpen && filtered.length > 0;

  /** Leading /token when the caret sits inside it, else null. */
  function leadingToken(nextValue: string, caret: number | null): string | null {
    if (!nextValue.startsWith("/") || caret === null) return null;
    const spaceAt = nextValue.search(/\s/);
    const tokenEnd = spaceAt === -1 ? nextValue.length : spaceAt;
    if (caret > tokenEnd) return null;
    return nextValue.slice(1, tokenEnd);
  }

  function syncMenu(nextValue: string, caret: number | null) {
    const token = leadingToken(nextValue, caret);
    if (token === null || filterCommands(token).length === 0) {
      setMenuOpen(false);
      return;
    }
    if (token !== menuQueryRef.current) {
      menuQueryRef.current = token;
      setMenuQuery(token);
      setActiveIndex(0);
    }
    setMenuOpen(true);
  }

  function completeCommand(command: SlashCommand) {
    const el = textareaRef.current;
    const current = el?.value ?? value;
    const spaceAt = current.search(/\s/);
    const rest = spaceAt === -1 ? "" : current.slice(spaceAt);
    const completed = `/${command.name}${rest ? ` ${rest.trimStart()}` : " "}`;
    setValue(completed);
    menuQueryRef.current = command.name;
    setMenuQuery(command.name);
    setMenuOpen(false);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = `/${command.name} `.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function caretOf(el: HTMLTextAreaElement | null): number | null {
    try {
      return el?.selectionStart ?? null;
    } catch {
      return null;
    }
  }

  function handleSend() {
    if (disabled) return;
    setMenuOpen(false);
    // Keep ref and state in sync: a stale menuQuery would filter the next
    // "/" invocation down to the previously selected command.
    menuQueryRef.current = "";
    setMenuQuery("");
    onSend(parseComposer(value));
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(
          (i) => (i - 1 + filtered.length) % filtered.length
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        completeCommand(filtered[activeIndex] ?? filtered[0]);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        completeCommand(filtered[activeIndex] ?? filtered[0]);
        return;
      }
      if (e.key === "Escape") {
        // Keep the reply-bar clearer from firing too.
        e.stopPropagation();
        setMenuOpen(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div>
      <div className="border-b border-line transition-colors focus-within:border-accent">
        <div className="relative">
          {menuVisible && (
            <SlashCommandMenu
              id="slash-command-menu"
              commands={filtered}
              activeIndex={activeIndex}
              onSelect={completeCommand}
              onHover={setActiveIndex}
            />
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              syncMenu(e.target.value, caretOf(e.target));
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => syncMenu(value, caretOf(e.currentTarget))}
            onClick={(e) => syncMenu(value, caretOf(e.currentTarget))}
            disabled={sending || capReached}
            rows={2}
            maxLength={10000}
            role="combobox"
            aria-expanded={menuVisible}
            aria-controls={menuVisible ? "slash-command-menu" : undefined}
            aria-activedescendant={
              menuVisible && filtered[activeIndex]
                ? `slash-command-menu-${filtered[activeIndex].name}`
                : undefined
            }
            aria-autocomplete="list"
            placeholder={
              capReached
                ? "You've reached your daily spending limit."
                : "Message teammates, or /ai to ask the AI…"
            }
            aria-label="Message your workspace"
            className="block w-full resize-none border-0 bg-transparent px-1 py-2 pr-12 text-sm text-ink placeholder:text-muted focus:ring-0 focus:outline-none disabled:cursor-not-allowed disabled:text-disabled"
          />
          <button
            onClick={handleSend}
            disabled={disabled}
            aria-label="Send message"
            title="Send (Enter)"
            className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-accent hover:text-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <ArrowUp className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-muted">
          {capReached ? (
            <span className="font-medium text-red-500">
              Daily limit reached. Resets tomorrow.
            </span>
          ) : null}
        </p>
        {sending && (
          <p className="text-xs text-muted">AI is responding...</p>
        )}
      </div>
    </div>
  );
}
