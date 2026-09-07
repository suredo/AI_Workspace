"use client";

import { useState } from "react";

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
      <div className="flex gap-3">
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
          className="flex-1 resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={handleSend}
          disabled={disabled}
          className="self-end rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          {capReached ? (
            <span className="font-medium text-red-600">
              Daily limit reached. Resets tomorrow.
            </span>
          ) : remainingCents !== null ? (
            <span>{formatDollars(remainingCents)} remaining today</span>
          ) : null}
        </p>
        {sending && (
          <p className="text-xs text-gray-500">AI is responding...</p>
        )}
      </div>
    </div>
  );
}
