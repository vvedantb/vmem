import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  createThread,
  listMessages,
  listUIMessages,
  saveMessage,
  syncStreams,
} from "@convex-dev/agent";
import { vStreamArgs, vUsage } from "@convex-dev/agent/validators";
import { components } from "./_generated/api";
import { authMutation, authQuery } from "./auth";

const memoryRefValidator = v.object({
  id: v.string(),
  title: v.string(),
  // Optional so older bubbles (written before hybrid search) round-trip
  // through this validator unchanged. New bubbles carry the full retrieval
  // trace so the chat UI can explain *why* each memory was pulled.
  trace: v.optional(
    v.object({
      score: v.number(),
      scoreBreakdown: v.object({
        fulltext: v.number(),
        vector: v.number(),
        recency: v.number(),
        confidence: v.number(),
      }),
      reason: v.string(),
    }),
  ),
});

export const getOrCreateThread = authMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      {
        userId: ctx.userId,
        paginationOpts: { cursor: null, numItems: 1 },
        order: "desc",
      },
    );
    if (existing.page.length > 0) {
      return existing.page[0]._id;
    }
    const threadId = await createThread(ctx, components.agent, {
      userId: ctx.userId,
    });
    return threadId;
  },
});

/**
 * Persist messages from local (in-browser) LLM inference into the shared thread.
 * Called by the web app's useLocalChat / voice hooks after streaming completes.
 * Saves both the user prompt and assistant response so they appear in thread history.
 *
 * `source` controls the `agentName` tag:
 *   - "vmem-local"       → text-based local chat (default)
 *   - "vmem-local-voice" → voice-mode local chat
 */
export const saveLocalMessages = authMutation({
  args: {
    threadId: v.string(),
    userText: v.string(),
    assistantText: v.string(),
    source: v.optional(v.string()),
    usage: v.optional(vUsage),
    memoryRefs: v.optional(v.array(memoryRefValidator)),
    assistantOrder: v.optional(v.number()),
    assistantStepOrder: v.optional(v.number()),
  },
  handler: async (
    ctx,
    {
      threadId,
      userText,
      assistantText,
      source,
      usage,
      memoryRefs,
      assistantOrder,
      assistantStepOrder,
    },
  ) => {
    const agentName = source ?? "vmem-local";
    const { messageId: promptId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: ctx.userId,
      message: { role: "user", content: userText },
      agentName,
    });
    await saveMessage(ctx, components.agent, {
      threadId,
      userId: ctx.userId,
      promptMessageId: promptId,
      message: { role: "assistant", content: assistantText },
      agentName,
      ...(usage ? { metadata: { usage } } : {}),
    });

    const hasRefs = memoryRefs !== undefined && memoryRefs.length > 0;
    if (hasRefs) {
      if (assistantOrder === undefined || assistantStepOrder === undefined) {
        throw new Error(
          "assistantOrder and assistantStepOrder are required when memoryRefs is non-empty",
        );
      }
      const bubbleKey = `${threadId}-${String(assistantOrder)}-${String(assistantStepOrder)}`;
      const existing = await ctx.db
        .query("chatMessageMemoryRefs")
        .withIndex("by_user_bubble", (q) =>
          q.eq("userId", ctx.userId).eq("bubbleKey", bubbleKey),
        )
        .first();
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      await ctx.db.insert("chatMessageMemoryRefs", {
        userId: ctx.userId,
        threadId,
        bubbleKey,
        refs: memoryRefs,
      });
    }

    return promptId;
  },
});

/**
 * Return token-usage summaries keyed by rendered UIMessage bubble key.
 *
 * Reads raw agent messages for the thread, replicates the assistant-bubble
 * grouping logic used by `toUIMessages` (group consecutive assistant/tool
 * records sharing the same `order`), then sums `usage` across grouped records.
 *
 * The key for each entry is `${threadId}-${order}-${stepOrder}` of the first
 * message in the group — identical to the `key` on the corresponding UIMessage.
 */
export const getThreadMessageUsage = authQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    // Track usage sums and the first-seen stepOrder per order group
    // in a single pass through all raw messages.
    const byOrder: Record<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        reasoningTokens: number;
        cachedInputTokens: number;
        firstStepOrder: number;
      }
    > = {};

    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await listMessages(ctx, components.agent, {
        threadId,
        paginationOpts: { cursor, numItems: 100 },
      });

      for (const msg of page.page) {
        const role = msg.message?.role;
        if (role === "user" || role === "system") continue;

        const orderKey = String(msg.order);
        const existing = byOrder[orderKey];

        if (existing) {
          // Always track the lowest stepOrder for the bubble key
          if (msg.stepOrder < existing.firstStepOrder) {
            existing.firstStepOrder = msg.stepOrder;
          }
          // Sum usage if present
          if (msg.usage) {
            existing.inputTokens += msg.usage.promptTokens;
            existing.outputTokens += msg.usage.completionTokens;
            existing.totalTokens += msg.usage.totalTokens;
            existing.reasoningTokens += msg.usage.reasoningTokens ?? 0;
            existing.cachedInputTokens += msg.usage.cachedInputTokens ?? 0;
          }
        } else {
          // First record for this order group
          byOrder[orderKey] = {
            inputTokens: msg.usage?.promptTokens ?? 0,
            outputTokens: msg.usage?.completionTokens ?? 0,
            totalTokens: msg.usage?.totalTokens ?? 0,
            reasoningTokens: msg.usage?.reasoningTokens ?? 0,
            cachedInputTokens: msg.usage?.cachedInputTokens ?? 0,
            firstStepOrder: msg.stepOrder,
          };
        }
      }

      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    // Re-key from order → bubble key, dropping entries with zero usage
    const byBubbleKey: Record<
      string,
      {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        reasoningTokens: number;
        cachedInputTokens: number;
      }
    > = {};

    for (const [orderKey, entry] of Object.entries(byOrder)) {
      if (entry.totalTokens === 0) continue;
      const bubbleKey = `${threadId}-${orderKey}-${entry.firstStepOrder}`;
      byBubbleKey[bubbleKey] = {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.totalTokens,
        reasoningTokens: entry.reasoningTokens,
        cachedInputTokens: entry.cachedInputTokens,
      };
    }

    return byBubbleKey;
  },
});

export const getThreadMessageMemoryRefs = authQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const rows = await ctx.db
      .query("chatMessageMemoryRefs")
      .withIndex("by_user_thread", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", threadId),
      )
      .collect();

    // Schema's `refs` already carries the optional trace, so we can return
    // rows verbatim — the consumer (useLocalChat → popover) handles the
    // "no trace" fallback.
    const byBubbleKey: Record<string, (typeof rows)[number]["refs"]> = {};

    for (const row of rows) {
      byBubbleKey[row.bubbleKey] = row.refs;
    }

    return byBubbleKey;
  },
});

export const listThreadMessages = authQuery({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: v.optional(vStreamArgs),
  },
  handler: async (ctx, args) => {
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    return { ...paginated, streams };
  },
});
