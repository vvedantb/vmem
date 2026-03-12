import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listUIMessages, syncStreams } from "@convex-dev/agent";
import { vStreamArgs } from "@convex-dev/agent/validators";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { vmemAgent } from "./agent";

export const createNewThread = authMutation({
  args: {},
  handler: async (ctx) => {
    const threadId = await vmemAgent.createThread(ctx, {
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

export const listThreads = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: ctx.userId,
      paginationOpts: args.paginationOpts,
      order: "desc",
    });
  },
});
