"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { MessageWithSender } from "@/lib/types";
import ChatThread from "./ChatThread";
import MessageInput, { type ComposerPayload } from "./MessageInput";
import { SLASH_COMMANDS } from "./commands";
import { useRealtimeMessages } from "./useRealtimeMessages";

const POLL_FALLBACK_INTERVAL_MS = 30000;
const STREAMING_PLACEHOLDER_ID = "streaming-ai-response";
const PAGE_LIMIT = 50;

interface Usage {
  cap_reached: boolean;
}

function isLocalMessage(m: MessageWithSender): boolean {
  return m.id === STREAMING_PLACEHOLDER_ID || m.id.startsWith("temp-user-");
}

export default function ChatPanel({
  workspaceId,
  currentUserId,
  members,
}: {
  workspaceId: string;
  currentUserId: string | null;
  members: { user_id: string; display_name: string }[];
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<{
    display_name: string;
    excerpt: string;
  } | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const streamingRef = useRef(false);

  const fetchMessages = useCallback(
    async (offset = 0) => {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/messages?limit=${PAGE_LIMIT}&offset=${offset}`
      );
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      return (data.messages || []) as MessageWithSender[];
    },
    [workspaceId]
  );

  const fetchUsage = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/usage`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.usage || null) as Usage | null;
  }, [workspaceId]);

  const refresh = useCallback(async () => {
    const [fetchedMessages, fetchedUsage] = await Promise.all([
      fetchMessages(0),
      fetchUsage(),
    ]);
    // Merge instead of replacing: keep already-loaded older pages, drop
    // local placeholders (their server rows are in the fresh window).
    setMessages((prev) => {
      const freshIds = new Set(fetchedMessages.map((m) => m.id));
      const oldestFresh = fetchedMessages[0]?.created_at;
      const older = prev.filter(
        (m) =>
          !isLocalMessage(m) &&
          !freshIds.has(m.id) &&
          (!oldestFresh || m.created_at <= oldestFresh)
      );
      return [...older, ...fetchedMessages];
    });
    setUsage(fetchedUsage);
  }, [fetchMessages, fetchUsage]);

  // Realtime arrivals slot before the streaming placeholder (if any) and
  // dedupe against refresh windows. Own rows are skipped: the optimistic
  // message already represents them (same-user other tabs fall back to
  // the poll loop).
  const handleRealtimeInsert = useCallback(
    (message: MessageWithSender) => {
      if (
        message.sender_id !== null &&
        message.sender_id === currentUserId
      ) {
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        const placeholderIndex = prev.findIndex(
          (m) => m.id === STREAMING_PLACEHOLDER_ID
        );
        if (placeholderIndex === -1) return [...prev, message];
        return [
          ...prev.slice(0, placeholderIndex),
          message,
          ...prev.slice(placeholderIndex),
        ];
      });
    },
    [currentUserId]
  );

  const realtimeStatus = useRealtimeMessages(
    workspaceId,
    members,
    handleRealtimeInsert
  );
  const realtimeConnectedRef = useRef(false);

  async function loadOlder() {
    if (loadingOlder) return;
    const offset = messages.filter((m) => !isLocalMessage(m)).length;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(offset);
      setHasMore(older.length === PAGE_LIMIT);
      if (older.length > 0) {
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const fresh = older.filter((m) => !ids.has(m.id));
          return [...fresh, ...prev];
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [fetchedMessages, fetchedUsage] = await Promise.all([
          fetchMessages(0),
          fetchUsage(),
        ]);
        if (!cancelled) {
          setMessages(fetchedMessages);
          setUsage(fetchedUsage);
          setHasMore(fetchedMessages.length === PAGE_LIMIT);
        }
      } catch {
        if (!cancelled) setLoadError("Failed to load messages.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Fallback poll: realtime owns liveness while subscribed; this only
    // recovers missed rows. Skipped while streaming, hidden, or live.
    const interval = setInterval(() => {
      if (streamingRef.current) return;
      if (document.hidden) return;
      if (realtimeConnectedRef.current) return;
      refresh().catch(() => {
        // Poll failures are non-fatal; the next tick retries.
      });
    }, POLL_FALLBACK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchMessages, fetchUsage, refresh]);

  // Track realtime connectivity for the fallback poll above, and close any
  // coverage gap with a refresh whenever the channel (re)connects — except
  // the very first subscribe, which duplicates the initial load.
  const wasRealtimeConnected = useRef(false);
  useEffect(() => {
    realtimeConnectedRef.current = realtimeStatus === "subscribed";
    if (realtimeStatus === "subscribed") {
      if (wasRealtimeConnected.current) {
        refresh().catch(() => {
          // Recovery refresh failures are non-fatal; fallback poll retries.
        });
      }
      wasRealtimeConnected.current = true;
    } else if (realtimeStatus === "closed" || realtimeStatus === "error") {
      wasRealtimeConnected.current = false;
    }
  }, [realtimeStatus, refresh]);

  async function handleSend(payload: ComposerPayload) {
    setSendError(null);
    if (payload.kind === "help") {
      setHelpOpen(true);
      return;
    }
    if (payload.kind === "unknown") {
      setSendError(
        payload.command === "ai"
          ? "Usage: /ai <your question>"
          : `Unknown command "/${payload.command}". Try /ai or /help.`
      );
      return;
    }

    // Prepend the quoted reply (if any) as an attributed blockquote so it
    // shows in history with a quote box and reaches the AI as context.
    const safeName = replyTo
      ? replyTo.display_name.replace(/[\r\n]+/g, " ")
      : "";
    const quote = replyTo
      ? [
          `> **Replying to ${safeName}**`,
          ...replyTo.excerpt
            .split("\n")
            .map((line) => `> ${line}`),
        ].join("\n") + "\n\n"
      : "";
    setReplyTo(null);
    const composed = quote + payload.text;

    if (payload.kind === "chat") {
      await sendChat(composed);
      return;
    }
    await sendAi(composed);
  }

  function makeOptimistic(content: string): MessageWithSender {
    return {
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
  }

  function dropOptimistic(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  /** Plain chat: save + broadcast, no LLM call. */
  async function sendChat(composed: string) {
    const optimistic = makeOptimistic(composed);
    setMessages((prev) => [...prev, optimistic]);

    let res: Response;
    try {
      res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: composed }),
      });
    } catch {
      dropOptimistic(optimistic.id);
      setSendError("Network error. Please try again.");
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
      dropOptimistic(optimistic.id);
      setSendError(message);
      return;
    }

    await refresh().catch(() => {
      // Reconciliation failures are non-fatal; the poll recovers.
    });
  }

  /** /ai command: today's streaming flow with spend gating. */
  async function sendAi(composed: string) {
    setStreaming(true);
    streamingRef.current = true;

    const optimistic = makeOptimistic(composed);
    setMessages((prev) => [...prev, optimistic]);

    let res: Response;
    try {
      res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: composed, invoke_ai: true }),
      });
    } catch {
      dropOptimistic(optimistic.id);
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
      dropOptimistic(optimistic.id);
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

  function handleReply(message: MessageWithSender) {
    const trimmed = message.content.trim();
    const excerpt =
      trimmed.length > 200 ? trimmed.slice(0, 200) + "…" : trimmed;
    setReplyTo({ display_name: message.display_name, excerpt });
  }

  useEffect(() => {
    if (!replyTo) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setReplyTo(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [replyTo]);

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
        onReply={handleReply}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-app via-app/80 to-transparent px-4 pt-16 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="pointer-events-auto mx-auto w-full max-w-[min(92%,100rem)] py-3">
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
        {helpOpen && (
          <div className="mt-2 rounded border border-line bg-elevated/60 px-3 py-2 text-xs text-muted">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono">
                {SLASH_COMMANDS.map((command, index) => (
                  <span key={command.name}>
                    {index > 0 && " · "}
                    <span className="font-semibold text-accent">
                      /{command.name}
                    </span>{" "}
                    {command.description.charAt(0).toLowerCase() +
                      command.description.slice(1)}
                  </span>
                ))}
              </p>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Dismiss help"
                className="rounded p-0.5 text-muted hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <p className="mt-1">
              Plain messages go to your teammates only — the AI stays quiet
              unless you call it.
            </p>
          </div>
        )}
        {replyTo && (
          <div className="mt-2 flex items-start gap-2 border-l-2 border-accent bg-elevated/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-accent">
                Replying to {replyTo.display_name}
              </p>
              <p className="truncate text-xs text-muted">{replyTo.excerpt}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Dismiss reply"
              className="rounded p-1 text-muted hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
