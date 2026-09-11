"use client";

import { Sparkles } from "lucide-react";
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

export default function MessageBubble({
  message,
  streaming = false,
  isOwn = false,
}: {
  message: MessageWithSender;
  streaming?: boolean;
  isOwn?: boolean;
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

  if (!isUser) {
    return (
      <div>
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
      </div>
    );
  }

  return (
    <div className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%]">
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
      </div>
    </div>
  );
}
