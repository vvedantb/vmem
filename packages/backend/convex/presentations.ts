import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";

/**
 * Live sharing for the `/slides` deck — "follow the presenter" (Teams-style),
 * without take-control. The presenter is the sole driver: only the browser
 * holding the secret `hostKey` (returned once from `createSession`) may move
 * the deck. Viewers are anonymous — they subscribe to `getSession` and either
 * follow `slide` live or detach to browse on their own.
 *
 * Every function is PUBLIC (the `/slides` route is reachable without sign-in).
 * Deliberately lean: no auth, no presence, no names — just a session row,
 * pruned daily.
 */

/** Idle (or ended) sessions older than this are pruned by the daily cron. */
const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000;
/** Length of the generated share code (hex chars from a UUID). */
const CODE_LENGTH = 7;

/** One count per (participant, option) — drops duplicate rows from races / legacy data. */
function tallyPollVotes(
  votes: Array<{
    participantKey: string;
    optionId: string;
  }>,
): { counts: Map<string, number>; total: number } {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const key = `${vote.participantKey}\0${vote.optionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
  }
  return { counts, total: seen.size };
}

async function deleteParticipantOptionVotes(
  ctx: MutationCtx,
  args: {
    code: string;
    pollId: string;
    participantKey: string;
    optionId: string;
  },
): Promise<void> {
  const rows = await ctx.db
    .query("presentationVotes")
    .withIndex("by_code_poll_participant_option", (q) =>
      q
        .eq("code", args.code)
        .eq("pollId", args.pollId)
        .eq("participantKey", args.participantKey)
        .eq("optionId", args.optionId),
    )
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/** Generate a short, URL-friendly share code, retrying on collision. */
async function generateUniqueCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = crypto.randomUUID().replace(/-/g, "").slice(0, CODE_LENGTH);
    const existing = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!existing) return code;
  }
  throw new Error("Could not generate a unique session code");
}

/**
 * Start sharing the current deck. Returns the `code` (goes in the share URL)
 * and the secret `hostKey` (kept in the presenter's localStorage and required
 * to drive / stop the session — never exposed to viewers).
 */
export const createSession = mutation({
  args: { slide: v.number() },
  returns: v.object({ code: v.string(), hostKey: v.string() }),
  handler: async (ctx, args) => {
    const code = await generateUniqueCode(ctx);
    const hostKey = crypto.randomUUID();
    await ctx.db.insert("presentationSessions", {
      code,
      hostKey,
      slide: args.slide,
      status: "live",
      lastActiveAt: Date.now(),
    });
    return { code, hostKey };
  },
});

/**
 * Live view of a session for every client. Deliberately omits `hostKey` (the
 * drive token). Returns null when the code has no session; an ended session
 * still resolves so viewers see it stopped.
 */
export const getSession = query({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      slide: v.number(),
      status: v.union(v.literal("live"), v.literal("ended")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session) return null;
    return { slide: session.slide, status: session.status };
  },
});

/** Move the deck. Silently no-ops unless the caller holds the host key. */
export const setSlide = mutation({
  args: { code: v.string(), hostKey: v.string(), slide: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.hostKey !== args.hostKey) return null;
    if (session.status !== "live") return null;
    await ctx.db.patch(session._id, {
      slide: args.slide,
      lastActiveAt: Date.now(),
    });
    return null;
  },
});

/** End the share for everyone. Host-key gated. */
export const stopSharing = mutation({
  args: { code: v.string(), hostKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.hostKey !== args.hostKey) return null;
    await ctx.db.patch(session._id, {
      status: "ended",
      lastActiveAt: Date.now(),
    });
    return null;
  },
});

/**
 * Single-choice poll: replaces any prior pick for this participant.
 */
export const sendVote = mutation({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
    optionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.status !== "live") return null;

    const prior = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey),
      )
      .collect();
    for (const vote of prior) {
      await ctx.db.delete(vote._id);
    }
    await ctx.db.insert("presentationVotes", {
      code: args.code,
      pollId: args.pollId,
      participantKey: args.participantKey,
      optionId: args.optionId,
    });
    await ctx.db.patch(session._id, { lastActiveAt: Date.now() });
    return null;
  },
});

/**
 * Multi-select poll: tap to toggle one option on or off for this participant.
 */
export const togglePollOption = mutation({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
    optionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.status !== "live") return null;

    const existing = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant_option", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey)
          .eq("optionId", args.optionId),
      )
      .first();
    if (existing) {
      await deleteParticipantOptionVotes(ctx, args);
    } else {
      await ctx.db.insert("presentationVotes", {
        code: args.code,
        pollId: args.pollId,
        participantKey: args.participantKey,
        optionId: args.optionId,
      });
    }
    await ctx.db.patch(session._id, { lastActiveAt: Date.now() });
    return null;
  },
});

/** This browser's current picks for one poll (source of truth for checkmarks). */
export const getMyPollSelections = query({
  args: {
    code: v.string(),
    pollId: v.string(),
    participantKey: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll_participant", (q) =>
        q
          .eq("code", args.code)
          .eq("pollId", args.pollId)
          .eq("participantKey", args.participantKey),
      )
      .collect();
    const seen = new Set<string>();
    const optionIds: string[] = [];
    for (const vote of votes) {
      if (seen.has(vote.optionId)) continue;
      seen.add(vote.optionId);
      optionIds.push(vote.optionId);
    }
    return optionIds;
  },
});

/** Presenter-only: wipe all votes for one poll in this session (fresh tally). */
export const clearPollVotes = mutation({
  args: { code: v.string(), hostKey: v.string(), pollId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.hostKey !== args.hostKey) return null;
    if (session.status !== "live") return null;

    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll", (q) =>
        q.eq("code", args.code).eq("pollId", args.pollId),
      )
      .collect();
    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }
    await ctx.db.patch(session._id, { lastActiveAt: Date.now() });
    return null;
  },
});

/**
 * Live tally for one poll. Returns a count per option id that has votes, plus
 * the total; the slide zero-fills options nobody picked yet.
 */
export const pollResults = query({
  args: { code: v.string(), pollId: v.string() },
  returns: v.object({
    options: v.array(v.object({ optionId: v.string(), count: v.number() })),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const votes = await ctx.db
      .query("presentationVotes")
      .withIndex("by_code_poll", (q) =>
        q.eq("code", args.code).eq("pollId", args.pollId),
      )
      .collect();
    const { counts, total } = tallyPollVotes(votes);
    return {
      options: [...counts.entries()].map(([optionId, count]) => ({
        optionId,
        count,
      })),
      total,
    };
  },
});

/** One-off GC for duplicate vote rows (races / legacy single-select data). */
export const dedupePollVotesInternal = internalMutation({
  args: {},
  returns: v.object({ removed: v.number() }),
  handler: async (ctx) => {
    const votes = await ctx.db.query("presentationVotes").collect();
    const seen = new Set<string>();
    let removed = 0;
    for (const vote of votes) {
      const key = `${vote.code}\0${vote.pollId}\0${vote.participantKey}\0${vote.optionId}`;
      if (seen.has(key)) {
        await ctx.db.delete(vote._id);
        removed += 1;
      } else {
        seen.add(key);
      }
    }
    return { removed };
  },
});

/**
 * Daily GC — drop ended or long-idle sessions and their votes so the tables
 * stay small. Wired into `crons.ts`.
 */
export const pruneStaleInternal = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SESSION_MAX_IDLE_MS;
    const sessions = await ctx.db.query("presentationSessions").collect();
    for (const session of sessions) {
      if (session.status !== "ended" && session.lastActiveAt >= cutoff) {
        continue;
      }
      const votes = await ctx.db
        .query("presentationVotes")
        .withIndex("by_code_poll", (q) => q.eq("code", session.code))
        .collect();
      for (const vote of votes) {
        await ctx.db.delete(vote._id);
      }
      await ctx.db.delete(session._id);
    }
    return null;
  },
});
