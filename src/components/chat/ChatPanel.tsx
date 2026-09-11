"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MessageWithSender } from "@/lib/types";
import ChatThread from "./ChatThread";
import MessageInput from "./MessageInput";

const POLL_INTERVAL_MS = 10000;
const STREAMING_PLACEHOLDER_ID = "streaming-ai-response";

interface Usage {
  cap_reached: boolean;
}

export default function ChatPanel({
  workspaceId,
  currentUserId,
}: {
  workspaceId: string;
  currentUserId: string | null;
}) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const streamingRef = useRef(false);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/messages?limit=50`);
    if (!res.ok) throw new Error("Failed to load messages");
    const data = await res.json();
    return (data.messages || []) as MessageWithSender[];
  }, [workspaceId]);

  const fetchUsage = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/usage`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.usage || null) as Usage | null;
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    const [fetchedMessages, fetchedUsage] = await Promise.all([
      fetchMessages(),
      fetchUsage(),
    ]);
    setMessages(fetchedMessages);
    setUsage(fetchedUsage);
  }, [fetchMessages, fetchUsage]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [fetchedMessages, fetchedUsage] = await Promise.all([
          fetchMessages(),
          fetchUsage(),
        ]);
        if (!cancelled) {
          setMessages(fetchedMessages);
          setUsage(fetchedUsage);
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load messages.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    const interval = setInterval(() => {
      if (streamingRef.current) return;
      refresh().catch(() => {
        // Poll failures are non-fatal; the next tick retries.
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchMessages, fetchUsage, refresh]);

  async function handleSend(content: string) {
    setSendError(null);
    setStreaming(true);
    streamingRef.current = true;

    const optimistic: MessageWithSender = {
      id: `temp-user-${Date.now()}`,
      workspace_id: workspaceId,
      // Attribute to the current user so the bubble aligns with their own
      // messages until the server state reconciles after streaming.
      sender_id: currentUserId,
      role: "user",
      content,
      model: null,
      cost_cents: null,
      reasoning: null,
      created_at: new Date().toISOString(),
      display_name: "You",
    };
    setMessages((prev) => [...prev, optimistic]);

    let res: Response;
    try {
      res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setSendError("Network error. Please try again.");
      setStreaming(false);
      streamingRef.current = false;
      return;
    }

    if (!res.ok) {
      let message = "Failed to send message.";
      try {
        const data = await res.json();
        if (data.error) message = data.error;
      } catch {
        // Keep the default message.
      }
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setSendError(message);
      if (res.status === 429) {
        fetchUsage().then(setUsage).catch(() => {});
      }
      setStreaming(false);
      streamingRef.current = false;
      return;
    }

    const placeholder: MessageWithSender = {
      id: STREAMING_PLACEHOLDER_ID,
      workspace_id: workspaceId,
      sender_id: null,
      role: "assistant",
      content: "",
      model: null,
      cost_cents: null,
      reasoning: "",
      created_at: new Date().toISOString(),
      display_name: "AI Assistant",
    };
    setMessages((prev) => [...prev, placeholder]);
    setStreamingMessageId(STREAMING_PLACEHOLDER_ID);

    try {
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }
          if (!trimmed.startsWith("data:")) continue;
          const raw = trimmed.slice(5).trim();
          let data: { content?: string; messageId?: string; message?: string };
          try {
            data = JSON.parse(raw);
          } catch {
            continue;
          }

          if (currentEvent === "token" && data.content) {
            const token = data.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === STREAMING_PLACEHOLDER_ID
                  ? { ...m, content: m.content + token }
                  : m
              )
            );
          } else if (currentEvent === "reasoning" && data.content) {
            const reasoning = data.content;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === STREAMING_PLACEHOLDER_ID
                  ? { ...m, reasoning: (m.reasoning || "") + reasoning }
                  : m
              )
            );
          } else if (currentEvent === "error") {
            throw new Error(data.message || "AI request failed");
          }
          // The done event carries the saved message id, but reconciliation
          // happens via refresh() below, so the streaming cursor stays on
          // the placeholder until the real messages arrive.
        }
      }

      await refresh();
    } catch (e) {
      setMessages((prev) =>
        prev.filter((m) => m.id !== STREAMING_PLACEHOLDER_ID)
      );
      setSendError(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setStreaming(false);
      streamingRef.current = false;
      setStreamingMessageId(null);
    }
  }

  const capReached = usage !== null && usage.cap_reached;

  if (loading) {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center text-muted">
        <p className="text-sm">Loading messages...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-64 flex-1 items-center justify-center">
        <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ChatThread
        messages={messages}
        streaming={streaming}
        streamingMessageId={streamingMessageId}
        currentUserId={currentUserId}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-app via-app/80 to-transparent px-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="pointer-events-auto mx-auto w-full max-w-4xl py-3">
        {sendError && (
          <div className="mb-3 rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            {sendError}{" "}
            {sendError.toLowerCase().includes("configur") && (
              <Link
                href={`/workspaces/${workspaceId}/settings`}
                className="font-medium underline hover:text-red-800"
              >
                Configure the AI provider in Settings.
              </Link>
            )}
          </div>
        )}
        <MessageInput
          onSend={handleSend}
          sending={streaming}
          capReached={capReached}
        />
        </div>
      </div>
    </div>
  );
}
