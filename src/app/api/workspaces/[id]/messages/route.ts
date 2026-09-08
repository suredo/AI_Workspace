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

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const MAX_SENDER_NAME_LENGTH = 50;

/**
 * Sanitize a display name for use in the "[Name]:" LLM prefix.
 * Strips bracket/angle/newline characters that could break the format
 * or forge attributions, trims, and caps length.
 */
export function sanitizeSenderName(name: string): string {
  const cleaned = name.replace(/[[<>\]\r\n]/g, "").trim().slice(0, MAX_SENDER_NAME_LENGTH).trim();
  return cleaned || "Unknown";
}

/**
 * Format a stored message for the LLM context. User messages get a
 * "[Name]:" prefix so the model knows who wrote what in the shared
 * thread; assistant messages pass through untouched. Uses display_name
 * as-is (see issue #40 for the future nickname rename).
 */
export function formatMessageForLLM(
  role: string,
  content: string,
  senderName: string | null
): LLMMessage {
  if (role === "assistant") {
    return { role: "assistant", content };
  }
  const name = senderName ? sanitizeSenderName(senderName) : "Unknown";
  return { role: "user", content: `[${name}]: ${content}` };
}

/**
 * Append shared-thread identity instructions to the workspace system
 * prompt (per-request only, never persisted). Deliberately permissive —
 * the model may use names when helpful, otherwise replies naturally.
 */
export function buildSystemPrompt(
  basePrompt: string,
  currentSenderName: string | null
): string {
  const current = currentSenderName ? sanitizeSenderName(currentSenderName) : null;
  const latest = current ? ` The latest message is from [${current}].` : "";
  return (
    `${basePrompt}\n\nThis is a shared workspace conversation. ` +
    `User messages are prefixed as [Name]: showing who wrote each message.${latest} ` +
    `You may refer to people by name when it helps; otherwise reply naturally.`
  );
}

const THINK_OPEN_RE = /^<(think|thinking)\s*>/i;
const THINK_CLOSE_RE = /^<\/(think|thinking)\s*>/i;
const THINK_CLOSE_SEARCH_RE = /<\/(think|thinking)\s*>/i;
const PARTIAL_TAG_RE = /^<\/?[a-z]*$/i;
// Longest tag is "</thinking>"; hold back at most this minus one char so a
// closing tag split across chunks can still be recognized.
const MAX_PARTIAL_TAG_HOLD = "</thinking>".length - 1;

export interface ThinkingFilterResult {
  /** Text safe to display and save as the answer. */
  visible: string;
  /** Thinking-trace text, for the collapsible reasoning view. */
  thinking: string;
}

/**
 * Stateful filter separating <think>/<thinking> blocks emitted by reasoning
 * models (Qwen, DeepSeek R1, and similar) from the visible answer. Handles
 * tags split across chunks. Pass flush=true after the final chunk to
 * release any held-back text.
 */
export function createThinkingFilter(): (
  chunk: string,
  flush?: boolean
) => ThinkingFilterResult {
  let inThink = false;
  let carry = "";

  function scan(text: string, flush: boolean): ThinkingFilterResult {
    let out = "";
    let thought = "";
    let i = 0;
    while (i < text.length) {
      if (inThink) {
        const rest = text.slice(i);
        const idx = rest.search(THINK_CLOSE_SEARCH_RE);
        if (idx === -1) {
          if (!flush && rest.length > MAX_PARTIAL_TAG_HOLD) {
            // Hold a possible split closing tag; the rest is thinking.
            thought += rest.slice(0, -MAX_PARTIAL_TAG_HOLD);
            carry = rest.slice(-MAX_PARTIAL_TAG_HOLD) + carry;
          } else if (!flush) {
            carry = rest + carry;
          } else {
            thought += rest;
          }
          return { visible: out, thinking: thought };
        }
        const match = rest.slice(idx).match(THINK_CLOSE_RE) as RegExpMatchArray;
        thought += rest.slice(0, idx);
        i += idx + match[0].length;
        inThink = false;
        continue;
      }
      const lt = text.indexOf("<", i);
      if (lt === -1) {
        out += text.slice(i);
        return { visible: out, thinking: thought };
      }
      out += text.slice(i, lt);
      const rest = text.slice(lt);
      const open = rest.match(THINK_OPEN_RE);
      if (open?.index === 0) {
        inThink = true;
        i = lt + open[0].length;
        continue;
      }
      const close = rest.match(THINK_CLOSE_RE);
      if (close?.index === 0) {
        i = lt + close[0].length; // stray closing tag: drop
        continue;
      }
      if (!flush && PARTIAL_TAG_RE.test(rest)) {
        carry = rest + carry; // possible split opening tag: wait for more
        return { visible: out, thinking: thought };
      }
      out += "<";
      i = lt + 1;
    }
    return { visible: out, thinking: thought };
  }

  return (chunk: string, flush = false): ThinkingFilterResult => {
    const text = carry + chunk;
    carry = "";
    return scan(text, flush);
  };
}

async function fetchSenderNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messages: { sender_id: string | null }[]
): Promise<Record<string, string>> {
  const userIds = [
    ...new Set(
      (messages || [])
        .map((m) => m.sender_id)
        .filter((id): id is string => typeof id === "string")
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
    .select(
      "id, workspace_id, sender_id, role, content, model, cost_cents, reasoning, created_at"
    )
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
        error: "You've reached your daily limit. Resets tomorrow.",
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
  // Sender ids are included so user messages can be prefixed with the
  // author's display name for the LLM. On failure we fall back to
  // system-prompt-only context.
  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content, sender_id")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false })
    .limit(CONTEXT_MESSAGE_COUNT);

  if (historyError) {
    logger.warn(CTX, "Failed to fetch context history, continuing with system prompt only", {
      error: historyError.message,
    });
  }

  type HistoryRow = { role: string; content: string; sender_id: string | null };
  let llmMessages: LLMMessage[];
  if (historyError || !history) {
    // No context available: send the bare base prompt without identity
    // instructions, since no prefixed user messages accompany it.
    llmMessages = [
      { role: "system", content: workspace.system_prompt as string },
    ];
  } else {
    const historyRows = (history.reverse() as HistoryRow[]).filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    const historyNames = await fetchSenderNames(supabase, historyRows);
    // The just-inserted user message is the newest row, so history already
    // carries the current sender's id — no extra user lookup needed.
    const currentSenderName = historyNames[userId] ?? null;

    llmMessages = [
      {
        role: "system",
        content: buildSystemPrompt(
          workspace.system_prompt as string,
          currentSenderName
        ),
      },
      ...historyRows.map((m) =>
        formatMessageForLLM(
          m.role,
          m.content,
          m.sender_id ? (historyNames[m.sender_id] ?? null) : null
        )
      ),
    ];
  }

  const model = workspace.llm_model as string;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        let fullContent = "";
        let thinkingContent = "";
        const filterThinking = createThinkingFilter();
        for await (const chunk of provider.sendMessageStream({
          messages: llmMessages,
          model,
        })) {
          if (chunk.type === "token" && chunk.content) {
            const { visible, thinking } = filterThinking(chunk.content);
            if (thinking) {
              thinkingContent += thinking;
              send("reasoning", { content: thinking });
            }
            if (visible) {
              fullContent += visible;
              send("token", { content: visible });
            }
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

        const tail = filterThinking("", true);
        if (tail.thinking) {
          thinkingContent += tail.thinking;
          send("reasoning", { content: tail.thinking });
        }
        if (tail.visible) {
          fullContent += tail.visible;
          send("token", { content: tail.visible });
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
            reasoning: thinkingContent || null,
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
