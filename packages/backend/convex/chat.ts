import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  createThread,
  getThreadMetadata,
  listMessages,
  listUIMessages,
  saveMessage,
  syncStreams,
} from "@convex-dev/agent";
import { vStreamArgs, vUsage } from "@convex-dev/agent/validators";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { getOrCreateDefaultProfile } from "./profiles/helpers";
import { runAssertProfileAccessInternal } from "./teams/auth";

/**
 * Defense-in-depth ownership gate shared by every thread-scoped function:
 * the agent component's thread doc must belong to the caller.
 */
async function assertThreadOwned(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
  userId: Id<"users">,
): Promise<void> {
  const thread = await getThreadMetadata(ctx, components.agent, { threadId });
  if (thread.userId !== userId) {
    throw new Error("Thread not found or not owned by user");
  }
}

const memoryRefValidator = v.object({
  id: v.string(),
  title: v.string(),
  trace: v.optional(
    v.object({
      score: v.number(),
      scoreBreakdown: v.object({
        fulltext: v.number(),
        vector: v.number(),
        chunk: v.optional(v.number()),
        entity: v.optional(v.number()),
        rrf: v.optional(v.number()),
        recency: v.number(),
        confidence: v.number(),
        graphPath: v.optional(
          v.object({
            seedTitle: v.string(),
            bridgingEntity: v.union(v.string(), v.null()),
            hops: v.number(),
          }),
        ),
        rerankerScore: v.optional(v.number()),
      }),
      reason: v.string(),
    }),
  ),
});

type MemoryRef = {
  id: string;
  title: string;
  trace?: {
    score: number;
    scoreBreakdown: {
      fulltext: number;
      vector: number;
      chunk?: number;
      entity?: number;
      rrf?: number;
      recency: number;
      confidence: number;
      graphPath?: {
        seedTitle: string;
        bridgingEntity: string | null;
        hops: number;
      };
      rerankerScore?: number;
    };
    reason: string;
  };
};

/** Replace any existing bubble refs, then insert the latest set. */
async function upsertChatMemoryRefs(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    threadId: string;
    bubbleKey: string;
    refs: MemoryRef[];
  },
): Promise<void> {
  const existing = await ctx.db
    .query("chatMessageMemoryRefs")
    .withIndex("by_user_bubble", (q) =>
      q.eq("userId", args.userId).eq("bubbleKey", args.bubbleKey),
    )
    .first();
  if (existing) {
    await ctx.db.delete(existing._id);
  }
  await ctx.db.insert("chatMessageMemoryRefs", {
    userId: args.userId,
    threadId: args.threadId,
    bubbleKey: args.bubbleKey,
    refs: args.refs,
  });
}

export const initiateStreaming = authMutation({
  args: {
    prompt: v.string(),
    threadId: v.string(),
    modelId: v.string(),
  },
  handler: async (ctx, { prompt, threadId, modelId }) => {
    if (!prompt.trim()) {
      throw new Error("Message cannot be empty");
    }

    const user = await ctx.db.get(ctx.userId);
    if (!user?.clerkId) {
      throw new Error("User identity missing");
    }

    await assertThreadOwned(ctx, threadId, ctx.userId);

    // Ground the stream in the thread's workspace: memory tools pin the
    // thread's profile, and team threads use the team scope + team skills.
    const mapping = await ctx.db
      .query("threadProfiles")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .first();
    let profileId: string | undefined;
    let teamId: Id<"teams"> | undefined;
    if (mapping) {
      const profile = await ctx.db.get(mapping.profileId);
      if (profile) {
        profileId = profile._id;
        teamId = profile.teamId;
      }
    }

    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId,
      userId: ctx.userId,
      message: { role: "user", content: prompt },
      agentName: "vmem-cloud",
    });

    await ctx.scheduler.runAfter(0, internal.chatStreamActions.streamAsync, {
      threadId,
      promptMessageId: messageId,
      userId: ctx.userId,
      modelId,
      clerkId: user.clerkId,
      profileId,
      teamId,
    });

    return { messageId };
  },
});

export const saveCloudMessageMemoryRefs = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    assistantOrder: v.number(),
    assistantStepOrder: v.number(),
    memoryRefs: v.array(memoryRefValidator),
  },
  handler: async (ctx, args) => {
    const bubbleKey = `${args.threadId}-${String(args.assistantOrder)}-${String(args.assistantStepOrder)}`;
    await upsertChatMemoryRefs(ctx, {
      userId: args.userId,
      threadId: args.threadId,
      bubbleKey,
      refs: args.memoryRefs,
    });
  },
});

/**
 * Resolve the caller's thread for a workspace: one active thread per
 * (user, profile). No `profileId` (mobile / voice / pre-workspace clients)
 * = the default personal profile, so those clients keep resolving the same
 * personal thread even after the web starts creating team-scoped threads.
 *
 * Legacy threads (created before thread↔profile mapping existed) are
 * lazily adopted into the default personal profile so existing history
 * shows up there instead of vanishing.
 */
export const getOrCreateThread = authMutation({
  args: { profileId: v.optional(v.id("profiles")) },
  handler: async (ctx, args) => {
    let profile: Doc<"profiles">;
    if (args.profileId) {
      profile = await runAssertProfileAccessInternal(ctx, {
        profileId: args.profileId,
        userId: ctx.userId,
      });
    } else {
      profile = await getOrCreateDefaultProfile(ctx, ctx.userId);
    }

    const mapped = await ctx.db
      .query("threadProfiles")
      .withIndex("by_user_profile", (q) =>
        q.eq("userId", ctx.userId).eq("profileId", profile._id),
      )
      .order("desc")
      .first();
    if (mapped) return mapped.threadId;

    // Legacy adoption — only into the default personal profile, and only
    // for threads that no workspace has claimed yet.
    if (profile.teamId === undefined && profile.isDefault) {
      const existing = await ctx.runQuery(
        components.agent.threads.listThreadsByUserId,
        {
          userId: ctx.userId,
          paginationOpts: { cursor: null, numItems: 10 },
          order: "desc",
        },
      );
      for (const thread of existing.page) {
        const claimed = await ctx.db
          .query("threadProfiles")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .first();
        if (!claimed) {
          await ctx.db.insert("threadProfiles", {
            userId: ctx.userId,
            threadId: thread._id,
            profileId: profile._id,
            createdAt: Date.now(),
          });
          return thread._id;
        }
      }
    }

    const threadId = await createThread(ctx, components.agent, {
      userId: ctx.userId,
    });
    await ctx.db.insert("threadProfiles", {
      userId: ctx.userId,
      threadId,
      profileId: profile._id,
      createdAt: Date.now(),
    });
    return threadId;
  },
});

/**
 * Wipe the user's chat thread and start a fresh one.
 *
 * Deletes:
 *   - every message + stream record under the thread (via the agent
 *     component's async cascade — kicks off a paginated tail-call delete)
 *   - every `chatMessageMemoryRefs` row scoped to (userId, threadId), so
 *     the popover trace doesn't outlive the bubbles it described
 *   - the thread document itself (handled by deleteAllForThreadIdAsync)
 *
 * Then immediately creates a new empty thread for the same user and
 * returns its id, so the UI can swap `threadId` without an extra
 * round-trip and the user can keep chatting.
 *
 * Ownership is verified via the agent's `getThread` — calling clear on
 * someone else's thread (or a non-existent one) throws.
 */
export const clearChatHistory = authMutation({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    // Defense-in-depth: confirm the caller actually owns this thread before
    // we cascade-delete its history.
    await assertThreadOwned(ctx, threadId, ctx.userId);

    // Drop our own per-thread sidecar rows. These live in our schema, not
    // in the agent component, so they wouldn't be touched by the cascade.
    const refRows = await ctx.db
      .query("chatMessageMemoryRefs")
      .withIndex("by_user_thread", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", threadId),
      )
      .collect();
    for (const row of refRows) {
      await ctx.db.delete(row._id);
    }

    // Async cascade delete: this mutation paginates one batch and schedules
    // itself to continue. Returns immediately even for very large threads.
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId,
    });

    // Hand back a fresh thread so the client can swap atomically with no
    // visible "no thread" state. The replacement inherits the old thread's
    // workspace mapping so the chat stays in the same profile.
    const newThreadId = await createThread(ctx, components.agent, {
      userId: ctx.userId,
    });
    const mapping = await ctx.db
      .query("threadProfiles")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .first();
    if (mapping) {
      await ctx.db.insert("threadProfiles", {
        userId: ctx.userId,
        threadId: newThreadId,
        profileId: mapping.profileId,
        createdAt: Date.now(),
      });
      await ctx.db.delete(mapping._id);
    }
    return newThreadId;
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
    await assertThreadOwned(ctx, threadId, ctx.userId);
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
      await upsertChatMemoryRefs(ctx, {
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
    await assertThreadOwned(ctx, threadId, ctx.userId);
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
    await assertThreadOwned(ctx, args.threadId, ctx.userId);
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
