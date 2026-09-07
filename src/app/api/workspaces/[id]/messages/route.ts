import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { getProvider } from "@/lib/providers";
import type { LLMMessage, LLMProvider } from "@/lib/providers/types";
import type { MessageWithSender } from "@/lib/types";

const CTX = "api:workspaces:[id]:messages";

const MAX_CONTENT_LENGTH = 10000;
const CONTEXT_MESSAGE_COUNT = 20;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

function todayUtcMidnightIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function fetchSenderNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messages: { sender_id: string | null }[]
): Promise<Record<string, string>> {
  const userIds = [
    ...new Set(
      (messages || [])
        .map((m) => m.sender_id)
        .filter((id): id is string => id !== null)
    ),
  ];
  const nameMap: Record<string, string> = {};
  if (userIds.length === 0) return nameMap;

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .in("id", userIds);
  if (users) {
    for (const u of users as { id: string; display_name: string }[]) {
      nameMap[u.id] = u.display_name;
    }
  }
  return nameMap;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "GET request received", { workspaceId: id });

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || String(DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT, 1),
    MAX_PAGE_LIMIT
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") || "0", 10) || 0,
    0
  );

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, workspace_id, sender_id, role, content, model, cost_cents, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (messagesError) {
    logger.error(CTX, "Failed to fetch messages", {
      error: messagesError.message,
    });
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }

  const nameMap = await fetchSenderNames(supabase, messages || []);
  const result: MessageWithSender[] = (messages || []).map((m) => ({
    ...(m as Omit<MessageWithSender, "display_name">),
    display_name:
      m.sender_id === null
        ? "AI Assistant"
        : nameMap[m.sender_id] || "Unknown",
  }));

  return NextResponse.json({ messages: result });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  logger.info(CTX, "POST request received", { workspaceId: id });

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const supabase = await createClient();

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("id, role, daily_cap_cents")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = body.content?.trim() ?? "";
  if (!content) {
    return NextResponse.json(
      { error: "Message content is required" },
      { status: 400 }
    );
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json(
      {
        error: `Message content must be ${MAX_CONTENT_LENGTH} characters or less`,
      },
      { status: 400 }
    );
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", id)
    .single();

  if (workspaceError || !workspace) {
    logger.error(CTX, "Failed to fetch workspace", {
      error: workspaceError?.message,
    });
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  if (!workspace.llm_api_key_encrypted) {
    return NextResponse.json(
      { error: "AI provider not configured" },
      { status: 400 }
    );
  }

  // Daily spending cap check (current usage only — cost estimation is
  // skipped while workspaces run on free models; see issue #15).
  // NOTE: assistant rows store sender_id NULL, so usage only reflects
  // rows attributed to this sender. When real per-token costs land,
  // attribute AI spend to the requesting member here.
  const { data: spendRows, error: spendError } = await supabase
    .from("messages")
    .select("cost_cents")
    .eq("workspace_id", id)
    .eq("sender_id", userId)
    .gte("created_at", todayUtcMidnightIso());

  if (spendError) {
    logger.error(CTX, "Failed to check spending cap", {
      error: spendError.message,
    });
    return NextResponse.json(
      { error: "Failed to check spending cap" },
      { status: 500 }
    );
  }

  const usageCents = (spendRows || []).reduce(
    (sum: number, row: { cost_cents: number | null }) =>
      sum + (row.cost_cents ?? 0),
    0
  );
  const dailyCap = membership.daily_cap_cents as number;
  if (usageCents >= dailyCap) {
    logger.warn(CTX, "Daily spending cap reached", {
      workspaceId: id,
      userId,
      usageCents,
      dailyCap,
    });
    return NextResponse.json(
      {
        error: `You've reached your daily limit of ${formatDollars(dailyCap)}. Resets tomorrow.`,
      },
      { status: 429 }
    );
  }

  let provider: LLMProvider;
  try {
    provider = getProvider(workspace);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to initialize provider";
    logger.error(CTX, "Failed to create provider", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Insert the user message before streaming the AI response.
  const { error: insertError } = await supabase.from("messages").insert({
    workspace_id: id,
    sender_id: userId,
    role: "user",
    content,
  });

  if (insertError) {
    logger.error(CTX, "Failed to insert user message", {
      error: insertError.message,
    });
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }

  // Fetch recent history for context (newest first, then reverse).
  // On failure we fall back to system-prompt-only context.
  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .limit(CONTEXT_MESSAGE_COUNT);

  if (historyError) {
    logger.warn(CTX, "Failed to fetch context history, continuing with system prompt only", {
      error: historyError.message,
    });
  }

  const llmMessages: LLMMessage[] = [
    { role: "system", content: workspace.system_prompt as string },
    ...((history || []).reverse() as { role: string; content: string }[])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
  ];

  const model = workspace.llm_model as string;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        let fullContent = "";
        for await (const chunk of provider.sendMessageStream({
          messages: llmMessages,
          model,
        })) {
          if (chunk.type === "token" && chunk.content) {
            fullContent += chunk.content;
            send("token", { content: chunk.content });
          } else if (chunk.type === "done") {
            break;
          } else if (chunk.type === "error") {
            send("error", {
              code: chunk.error?.code ?? "unknown",
              message: chunk.error?.message ?? "AI request failed",
            });
            return;
          }
        }

        // Free models report no usage cost; store 0 until real
        // per-token pricing is wired up (see issue #15).
        const { data: aiMessage, error: aiInsertError } = await supabase
          .from("messages")
          .insert({
            workspace_id: id,
            sender_id: null,
            role: "assistant",
            content: fullContent || "(no response)",
            model,
            cost_cents: 0,
          })
          .select("id")
          .single();

        if (aiInsertError || !aiMessage) {
          logger.error(CTX, "Failed to insert AI message", {
            error: aiInsertError?.message,
          });
          send("error", {
            code: "unknown",
            message: "Failed to save AI response",
          });
          return;
        }

        send("done", { messageId: (aiMessage as { id: string }).id });
      } catch (e) {
        const error = e as { code?: string; message?: string };
        logger.warn(CTX, "Streaming failed", { error: error.message });
        send("error", {
          code: error.code ?? "unknown",
          message: error.message ?? "AI request failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
