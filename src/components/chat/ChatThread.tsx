"use client";

import { useEffect, useRef } from "react";
import type { MessageWithSender } from "@/lib/types";
import MessageBubble from "./MessageBubble";

export default function ChatThread({
  messages,
  streaming,
  streamingMessageId,
  currentUserId,
}: {
  messages: MessageWithSender[];
  streaming: boolean;
  streamingMessageId: string | null;
  currentUserId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Sticky-scroll: only yank to the bottom when the user is already near
  // it, so background polls don't interrupt someone reading history.
  const stickToBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No messages yet</p>
          <p className="mt-1 text-sm">Start the conversation below.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"
    >
      <div className="mx-auto w-full max-w-3xl space-y-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          streaming={streaming && message.id === streamingMessageId}
          isOwn={message.sender_id !== null && message.sender_id === currentUserId}
        />
      ))}
      {streaming && streamingMessageId === null && (
        <div className="flex justify-start">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm text-gray-500 dark:text-gray-400 shadow-sm">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400" />{" "}
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />{" "}
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
