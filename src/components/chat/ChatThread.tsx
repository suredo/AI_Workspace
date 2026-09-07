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

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !streaming) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-500">No messages yet</p>
          <p className="mt-1 text-sm">Start the conversation below.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-96 space-y-4 overflow-y-auto px-6 py-4">
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
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400" />{" "}
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />{" "}
            <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </div>
  );
}
