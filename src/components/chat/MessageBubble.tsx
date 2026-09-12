"use client";

import { useState } from "react";
import { Check, Copy, Reply, Sparkles } from "lucide-react";
import type { MessageWithSender } from "@/lib/types";
import MarkdownContent from "./MarkdownContent";

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessageActions({
  align,
  copied,
  onCopy,
  onReply,
}: {
  align: "left" | "right";
  copied: boolean;
  onCopy: () => void;
  onReply: () => void;
}) {
  return (
    <div
      className={`mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? "Copied" : "Copy message"}
        title={copied ? "Copied" : "Copy message"}
        className="rounded p-1 text-muted hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={onReply}
        aria-label="Reply to message"
        title="Reply to message"
        className="rounded p-1 text-muted hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Reply className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export default function MessageBubble({
  message,
  streaming = false,
  isOwn = false,
  onReply,
}: {
  message: MessageWithSender;
  streaming?: boolean;
  isOwn?: boolean;
  onReply: (message: MessageWithSender) => void;
}) {
  const isUser = message.role === "user";
  // Reasoning traces and answers often carry boundary newlines around the
  // </think> tag; trim the edges so no blank gap renders while keeping
  // intentional line breaks inside the text (whitespace-pre-wrap).
  const content = message.content.trim();
  const reasoning = message.reasoning?.trim() || null;

  // Own messages sit on the right; teammates' on the left. AI responses
  // render as open documents with a violet identity marker, never as
  // bubbles, so the conversation blends into the workspace background.
  const alignRight = isUser && isOwn;
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Copies the raw source (markdown for AI, plain text for users) so
    // pasting preserves code and formatting.
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, insecure context); stay silent.
    }
  }

  if (!isUser) {
    return (
      <div className="group">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span className="text-xs font-semibold text-ink">AI Assistant</span>
          {message.model && (
            <span className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[11px] text-accent">
              {message.model}
            </span>
          )}
          <span className="text-[11px] text-muted">
            {formatTime(message.created_at)}
          </span>
        </div>
        {reasoning && (
          <details className="mt-2 rounded border border-line px-2 py-1 text-xs text-muted">
            <summary className="cursor-pointer font-medium hover:text-secondary">
              Show thinking
            </summary>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {reasoning}
            </p>
          </details>
        )}
        <div className="mt-2">
          <MarkdownContent content={content} streaming={streaming} />
        </div>
        <MessageActions
          align="left"
          copied={copied}
          onCopy={handleCopy}
          onReply={() => onReply(message)}
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex ${alignRight ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[85%] rounded-md px-3 py-2 ${
          alignRight ? "bg-elevated" : "bg-elevated/60"
        }`}
      >
        <div
          className={`mb-1 flex items-baseline gap-2 ${
            alignRight ? "justify-end" : "justify-start"
          }`}
        >
          <span className="text-xs font-semibold text-secondary">
            {message.display_name}
          </span>
          <span className="text-[11px] text-muted">
            {formatTime(message.created_at)}
          </span>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {content}
          {streaming && (
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
          )}
        </p>
        <MessageActions
          align={alignRight ? "right" : "left"}
          copied={copied}
          onCopy={handleCopy}
          onReply={() => onReply(message)}
        />
      </div>
    </div>
  );
}
