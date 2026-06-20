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
 * the deck. Viewers subscribe to `getSession` and either follow `slide` live
 * or detach to browse on their own; a heartbeat powers the presenter's
 * "who's watching" list.
 *
 * Every function here is PUBLIC (the `/slides` route is reachable without
 * sign-in). `createSession` attaches the signed-in user opportunistically for
 * attribution, but never requires auth.
 */

/** Freshness window for the "who's watching" list. */
const PRESENCE_TTL_MS = 30_000;
/** Idle (or ended) sessions older than this are pruned by the daily cron. */
const SESSION_MAX_IDLE_MS = 24 * 60 * 60 * 1000;
/** Length of the generated share code (hex chars from a UUID). */
const CODE_LENGTH = 7;

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
 * and the secret `hostKey` (the caller stores this in localStorage and passes
 * it to drive / stop the session — it is never exposed to viewers).
 */
export const createSession = mutation({
  args: { slide: v.number(), hostName: v.string() },
  returns: v.object({ code: v.string(), hostKey: v.string() }),
  handler: async (ctx, args) => {
    const code = await generateUniqueCode(ctx);
    const hostKey = crypto.randomUUID();
    const now = Date.now();

    // Attribution only — the route is public, so an unauthenticated presenter
    // is fine; we just skip linking a user in that case.
    const clerkId = (await ctx.auth.getUserIdentity())?.subject;
    const hostUserId = clerkId
      ? (
          await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
            .first()
        )?._id
      : undefined;

    await ctx.db.insert("presentationSessions", {
      code,
      hostKey,
      hostName: args.hostName,
      hostUserId,
      slide: args.slide,
      status: "live",
      createdAt: now,
      lastActiveAt: now,
    });

    // Seed the presenter's own presence row (role "host", excluded from the
    // viewer count) so the session is immediately "active".
    await ctx.db.insert("presentationParticipants", {
      code,
      participantKey: hostKey,
      name: args.hostName,
      role: "host",
      lastSeenAt: now,
    });

    return { code, hostKey };
  },
});

/**
 * Live view of a session for every client. Deliberately omits `hostKey` (the
 * drive token). Returns null only when the code has no session at all; an
 * ended session still resolves so viewers can see it stopped.
 */
export const getSession = query({
  args: { code: v.string() },
  returns: v.union(
    v.object({
      slide: v.number(),
      hostName: v.string(),
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
    return {
      slide: session.slide,
      hostName: session.hostName,
      status: session.status,
    };
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

/** Per-client presence ping (~every 15s). Upserts one row per participant. */
export const heartbeat = mutation({
  args: {
    code: v.string(),
    participantKey: v.string(),
    name: v.string(),
    role: v.union(v.literal("host"), v.literal("viewer")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("presentationSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .first();
    if (!session || session.status !== "live") return null;

    const now = Date.now();
    const existing = await ctx.db
      .query("presentationParticipants")
      .withIndex("by_code_participant", (q) =>
        q.eq("code", args.code).eq("participantKey", args.participantKey),
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, lastSeenAt: now });
    } else {
      await ctx.db.insert("presentationParticipants", {
        code: args.code,
        participantKey: args.participantKey,
        name: args.name,
        role: args.role,
        lastSeenAt: now,
      });
    }
    return null;
  },
});

/**
 * Who is currently in the session (seen within the last 30s). Subscribed by
 * the presenter for the "N watching" indicator. Re-runs whenever any client
 * heartbeats, so stale rows drop within one heartbeat cycle.
 */
export const listParticipants = query({
  args: { code: v.string() },
  returns: v.array(
    v.object({
      participantKey: v.string(),
      name: v.string(),
      role: v.union(v.literal("host"), v.literal("viewer")),
    }),
  ),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("presentationParticipants")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .collect();
    return rows
      .filter((row) => row.lastSeenAt >= cutoff)
      .map((row) => ({
        participantKey: row.participantKey,
        name: row.name,
        role: row.role,
      }));
  },
});

/**
 * Daily GC — drop ended or long-idle sessions and their presence rows so the
 * tables stay small. Wired into `crons.ts`.
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
      const participants = await ctx.db
        .query("presentationParticipants")
        .withIndex("by_code", (q) => q.eq("code", session.code))
        .collect();
      for (const participant of participants) {
        await ctx.db.delete(participant._id);
      }
      await ctx.db.delete(session._id);
    }
    return null;
  },
});
