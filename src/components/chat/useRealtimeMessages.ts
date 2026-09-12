"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageWithSender } from "@/lib/types";

export type RealtimeStatus = "connecting" | "subscribed" | "closed" | "error";

export interface MemberName {
  user_id: string;
  display_name: string;
}

interface InsertPayload {
  new: {
    id: string;
    workspace_id: string;
    sender_id: string | null;
    role: "user" | "assistant" | "system";
    content: string;
    model: string | null;
    cost_cents: number | null;
    reasoning: string | null;
    created_at: string;
  };
}

/** Map a realtime row's sender to a display name (AI has none). */
export function resolveSenderName(
  senderId: string | null,
  members: MemberName[]
): string {
  if (senderId === null) return "AI Assistant";
  return (
    members.find((m) => m.user_id === senderId)?.display_name ?? "Unknown"
  );
}

/**
 * Subscribe to new messages in a workspace. The poll loop stays as a
 * fallback and recovery path; see ChatPanel.
 */
export function useRealtimeMessages(
  workspaceId: string,
  members: MemberName[],
  onInsert: (message: MessageWithSender) => void
): RealtimeStatus {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const onInsertRef = useRef(onInsert);
  const membersRef = useRef(members);

  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createClient>;
    try {
      // Missing env (e.g. stale dev server predating .env.local) must
      // degrade to the poll fallback, never crash the chat page.
      supabase = createClient();
    } catch (err) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("error");
      console.warn(
        "[realtime] client unavailable, using poll fallback",
        err instanceof Error ? err.message : err
      );
      return;
    }
    const channel = supabase
      .channel(`workspace:${workspaceId}:messages`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload: InsertPayload) => {
          if (cancelled) return;
          const row = payload.new;
          onInsertRef.current({
            ...row,
            cost_cents: null,
            display_name: resolveSenderName(row.sender_id, membersRef.current),
          });
        }
      )
      .subscribe((s, err) => {
        if (cancelled) return;
        if (s === "SUBSCRIBED") {
          setStatus("subscribed");
          console.debug("[realtime] subscribed");
        } else if (s === "CLOSED") {
          setStatus("closed");
          console.warn("[realtime] channel closed", err ?? "");
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("error");
          console.warn("[realtime] subscribe failed", s, err ?? "");
        } else setStatus("connecting");
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  return status;
}
