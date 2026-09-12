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

interface ParsedReply {
  author: string | null;
  excerpt: string;
  body: string;
}

/**
 * Split a leading markdown quote run off a user message. Returns null when
 * the message is not a reply (or is quote-only), so AI responses starting
 * with `>` and pasted quote-only text keep their plain rendering.
 */
export function splitReply(content: string): ParsedReply | null {
  const lines = content.split("\n");
  if (lines.length === 0 || !lines[0].startsWith(">")) return null;
  const quoteLines: string[] = [];
  let i = 0;
  while (i < lines.length && lines[i].startsWith(">")) {
    quoteLines.push(lines[i].replace(/^>\s?/, ""));
    i++;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  const body = lines.slice(i).join("\n").trim();
  if (quoteLines.length === 0 || !body) return null;
  let author: string | null = null;
  let excerptLines = quoteLines;
  const attribution = /^\*\*Replying to (.+)\*\*$/.exec(quoteLines[0].trim());
  if (attribution) {
    author = attribution[1];
    excerptLines = quoteLines.slice(1);
  }
  const excerpt = excerptLines.join("\n").trim();
  if (!excerpt) return null;
  return { author, excerpt, body };
}

function normalizeForMatch(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * Recover the quoted author for unattributed (legacy/pasted) quotes by
 * matching the excerpt against loaded thread messages. Works for teammates
 * and AI alike, since matching is purely textual.
 */
export function findQuoteAuthor(
  excerpt: string,
  messages: MessageWithSender[],
  selfId: string
): string | null {
  const needle = normalizeForMatch(excerpt);
  if (!needle) return null;
  const match = messages.find(
    (message) =>
      message.id !== selfId &&
      normalizeForMatch(message.content).includes(needle)
  );
  return match ? match.display_name : null;
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
  quoteAuthor = null,
}: {
  message: MessageWithSender;
  streaming?: boolean;
  isOwn?: boolean;
  onReply: (message: MessageWithSender) => void;
  quoteAuthor?: string | null;
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
  // Replies (user messages only) get an attached quote box; AI responses
  // starting with `>` keep their plain prose rendering.
  const reply = isUser ? splitReply(content) : null;
  const quotedName = reply?.author ?? quoteAuthor;
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
        {reply && (
          <div className="mb-2 rounded border border-line border-l-2 border-l-accent bg-app/60 px-3 py-2">
            <p className="text-xs font-semibold text-accent">
              {quotedName ? `Replying to ${quotedName}` : "Quoted message"}
            </p>
            <p className="mt-0.5 line-clamp-4 text-xs whitespace-pre-wrap text-muted">
              {reply.excerpt}
            </p>
          </div>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
          {reply ? reply.body : content}
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
