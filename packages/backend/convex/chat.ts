import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  listMessages,
  listUIMessages,
  saveMessage,
  syncStreams,
} from "@convex-dev/agent";
import { vStreamArgs, vUsage } from "@convex-dev/agent/validators";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { vmemAgent } from "./agent";

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
    const { threadId } = await vmemAgent.createThread(ctx, {
      userId: ctx.userId,
    });
    return threadId;
  },
});

export const initiateStreaming = authMutation({
  args: {
    prompt: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, { prompt, threadId }) => {
    const { messageId } = await vmemAgent.saveMessage(ctx, {
      threadId,
      prompt,
      skipEmbeddings: true,
    });
    await ctx.scheduler.runAfter(0, internal.chat.streamAsync, {
      threadId,
      promptMessageId: messageId,
      userId: ctx.userId,
    });
    return messageId;
  },
});

export const streamAsync = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { threadId, promptMessageId, userId }) => {
    const result = await vmemAgent.streamText(
      ctx,
      { threadId, userId },
      { promptMessageId },
      { saveStreamDeltas: true },
    );
    await result.consumeStream();
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
  },
  handler: async (
    ctx,
    { threadId, userText, assistantText, source, usage },
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
          }
        } else {
          // First record for this order group
          byOrder[orderKey] = {
            inputTokens: msg.usage?.promptTokens ?? 0,
            outputTokens: msg.usage?.completionTokens ?? 0,
            totalTokens: msg.usage?.totalTokens ?? 0,
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
      { inputTokens: number; outputTokens: number; totalTokens: number }
    > = {};

    for (const [orderKey, entry] of Object.entries(byOrder)) {
      if (entry.totalTokens === 0) continue;
      const bubbleKey = `${threadId}-${orderKey}-${entry.firstStepOrder}`;
      byBubbleKey[bubbleKey] = {
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.totalTokens,
      };
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
