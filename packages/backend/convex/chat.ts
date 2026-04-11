import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listMessages, listUIMessages, syncStreams } from "@convex-dev/agent";
import { vStreamArgs } from "@convex-dev/agent/validators";
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

export const getThreadMessageUsage = authQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const result = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { cursor: null, numItems: 200 },
    });

    const usageByMessageId: Record<
      string,
      {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        reasoningTokens?: number;
        cachedInputTokens?: number;
      }
    > = {};

    for (const msg of result.page) {
      if (msg.usage) {
        usageByMessageId[msg._id] = {
          promptTokens: msg.usage.promptTokens,
          completionTokens: msg.usage.completionTokens,
          totalTokens: msg.usage.totalTokens,
          reasoningTokens: msg.usage.reasoningTokens,
          cachedInputTokens: msg.usage.cachedInputTokens,
        };
      }
    }

    return usageByMessageId;
  },
});
