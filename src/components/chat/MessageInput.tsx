"use client";

import { useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function MessageInput({
  onSend,
  sending,
  capReached,
  remainingCents,
}: {
  onSend: (content: string) => void;
  sending: boolean;
  capReached: boolean;
  remainingCents: number | null;
}) {
  const [value, setValue] = useState("");

  const trimmed = value.trim();
  const disabled = sending || capReached || trimmed.length === 0;

  function handleSend() {
    if (disabled) return;
    onSend(trimmed);
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
              : "Type a message... (Enter to send, Shift+Enter for newline)"
          }
          className="block w-full resize-none rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 pr-12 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:dark:bg-gray-800 disabled:text-gray-400 disabled:dark:text-gray-500"
        />
        <button
          onClick={handleSend}
          disabled={disabled}
          aria-label="Send message"
          title="Send"
          className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ArrowUp className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {capReached ? (
            <span className="font-medium text-red-600 dark:text-red-400">
              Daily limit reached. Resets tomorrow.
            </span>
          ) : remainingCents !== null ? (
            <span>{formatDollars(remainingCents)} remaining today</span>
          ) : null}
        </p>
        {sending && (
          <p className="text-xs text-gray-500 dark:text-gray-400">AI is responding...</p>
        )}
      </div>
    </div>
  );
}
