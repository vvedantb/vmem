import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { listUIMessages, saveMessage, syncStreams } from "@convex-dev/agent";
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
  },
  handler: async (ctx, { threadId, userText, assistantText, source }) => {
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
    });
    return promptId;
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
