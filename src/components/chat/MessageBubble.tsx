"use client";

import type { MessageWithSender } from "@/lib/types";

function formatCost(costCents: number | null): string | null {
  if (costCents === null) return null;
  return `$${(costCents / 100).toFixed(2)}`;
}

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
}: {
  message: MessageWithSender;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  const cost = formatCost(message.cost_cents);
  // Reasoning traces and answers often carry boundary newlines around the
  // </think> tag; trim the edges so no blank gap renders while keeping
  // intentional line breaks inside the text (whitespace-pre-wrap).
  const content = message.content.trim();
  const reasoning = message.reasoning?.trim() || null;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 shadow-sm ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-gray-200 bg-white text-gray-900"
        }`}
      >
        <div
          className={`mb-1 flex items-baseline gap-2 ${
            isUser ? "justify-end" : "justify-start"
          }`}
        >
          <span
            className={`text-xs font-semibold ${
              isUser ? "text-blue-100" : "text-gray-700"
            }`}
          >
            {isUser ? message.display_name : "AI Assistant"}
          </span>
          <span
            className={`text-[11px] ${isUser ? "text-blue-200" : "text-gray-400"}`}
          >
            {formatTime(message.created_at)}
          </span>
        </div>
        {!isUser && reasoning && (
          <details className="mb-2 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-500">
            <summary className="cursor-pointer font-medium hover:text-gray-700">
              Show thinking
            </summary>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
              {reasoning}
            </p>
          </details>
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {content}
          {streaming && (
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-current align-middle" />
          )}
        </p>
        {!isUser && (message.model || cost) && (
          <p className="mt-2 text-[11px] text-gray-400">
            {message.model && <span>{message.model}</span>}
            {message.model && cost && <span> &middot; </span>}
            {cost && <span>{cost}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
