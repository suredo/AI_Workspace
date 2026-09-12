"use client";

import { useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

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
  const [, command, rest] = match;
  if (command === "ai") {
    return rest.trim()
      ? { kind: "ai", text, command }
      : { kind: "unknown", text, command };
  }
  if (command === "help") return { kind: "help", text, command };
  return { kind: "unknown", text, command };
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

  const trimmed = value.trim();
  const disabled = sending || capReached || trimmed.length === 0;

  function handleSend() {
    if (disabled) return;
    onSend(parseComposer(value));
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div>
      <div className="border-b border-line transition-colors focus-within:border-accent">
        <div className="relative">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || capReached}
            rows={2}
            maxLength={10000}
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
