"use client";

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

  // Own messages sit on the right; teammates' on the left; AI gets its
  // own tinted treatment so it never reads as another member.
  const alignRight = isUser && isOwn;
  const bubbleClass = !isUser
    ? "border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/60 text-gray-900 dark:text-gray-100"
    : alignRight
      ? "bg-blue-600 text-white"
      : "border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100";
  const nameClass = !isUser
    ? "text-indigo-900 dark:text-indigo-200"
    : alignRight
      ? "text-blue-100"
      : "text-gray-900 dark:text-gray-100";
  const timeClass = !isUser
    ? "text-indigo-300 dark:text-indigo-400"
    : alignRight
      ? "text-blue-200"
      : "text-gray-400 dark:text-gray-500";

  return (
    <div className={`flex ${alignRight ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg px-4 py-3 shadow-sm ${bubbleClass}`}>
        <div
          className={`mb-1 flex items-baseline gap-2 ${
            alignRight ? "justify-end" : "justify-start"
          }`}
        >
          <span className={`text-xs font-semibold ${nameClass}`}>
            {isUser ? message.display_name : "AI Assistant"}
          </span>
          <span className={`text-[11px] ${timeClass}`}>
            {formatTime(message.created_at)}
          </span>
        </div>
        {!isUser && reasoning && (
          <details className="mb-2 rounded-md bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer font-medium hover:text-gray-700 dark:hover:text-gray-300">
              Show thinking
            </summary>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {reasoning}
            </p>
          </details>
        )}
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content}
            {streaming && (
              <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
            )}
          </p>
        ) : (
          <MarkdownContent content={content} streaming={streaming} />
        )}
        {!isUser && message.model && (
          <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
            <span>{message.model}</span>
          </p>
        )}
      </div>
    </div>
  );
}
