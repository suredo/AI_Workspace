"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import type { MessageWithSender } from "@/lib/types";
import MessageBubble, { findQuoteAuthor, splitReply } from "./MessageBubble";

export default function ChatThread({
  messages,
  streaming,
  streamingMessageId,
  currentUserId,
  onReply,
  hasMore,
  loadingOlder,
  onLoadOlder,
}: {
  messages: MessageWithSender[];
  streaming: boolean;
  streamingMessageId: string | null;
  currentUserId: string | null;
  onReply: (message: MessageWithSender) => void;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Sticky-scroll: only yank to the bottom when the user is already near
  // it, so background polls don't interrupt someone reading history.
  const stickToBottomRef = useRef(true);
  // Scroll anchoring for prepended pages: record the height before loading
  // older messages, then shift scrollTop by the growth afterwards.
  const restoreHeightRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    if (
      el.scrollTop < 300 &&
      hasMore &&
      !loadingOlder &&
      !loadingOlderRef.current
    ) {
      loadingOlderRef.current = true;
      restoreHeightRef.current = el.scrollHeight;
      onLoadOlder().finally(() => {
        loadingOlderRef.current = false;
      });
    }
  }

  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const el = containerRef.current;
    if (el && restoreHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - restoreHeightRef.current;
      restoreHeightRef.current = null;
    }
  }, [messages]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center text-muted">
        <div className="text-center">
          <p className="text-sm font-medium text-secondary">No messages yet</p>
          <p className="mt-1 text-sm">Start the conversation below.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6"
    >
      <div className="mx-auto w-full max-w-[min(92%,100rem)] space-y-6 pb-48">
      {loadingOlder && (
        <div className="flex justify-center py-2 text-xs text-muted">
          Loading older messages...
        </div>
      )}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          streaming={streaming && message.id === streamingMessageId}
          isOwn={message.sender_id !== null && message.sender_id === currentUserId}
          onReply={onReply}
          quoteAuthor={findQuoteAuthor(
            splitReply(message.content.trim())?.excerpt ?? "",
            messages,
            message.id
          )}
        />
      ))}
      {streaming && streamingMessageId === null && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <LoaderCircle
            className="h-4 w-4 animate-spin text-accent"
            aria-hidden
          />
          <span>AI is thinking...</span>
        </div>
      )}
      </div>
    </div>
  );
}
