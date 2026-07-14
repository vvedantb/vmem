import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getUserByClerkId } from "./auth";
import { dayKeyForUtc, MIN_NEW_MEMORIES } from "./lib/dreamTriggerDecision";

async function getStateRow(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Doc<"dreamTriggerState"> | null> {
  return await ctx.db
    .query("dreamTriggerState")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

async function isAutomaticEnabled(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  // Absent = true: Dynamic Dreaming is on by default (soft-fails without
  // an OpenRouter key, so default-on costs nothing for unconfigured users).
  return settings?.dreamModeAutomatic ?? true;
}

/**
 * Record a memory write. Bumps the new-memory counter + lastWriteAt and
 * decides whether the caller should schedule a debounced dream check.
 *
 * Returns true exactly once per burst: when automatic mode is on, no
 * check is already pending, and the counter has reached the minimum.
 * Sets `checkPending` in the same mutation, so concurrent writes can't
 * double-schedule (Convex mutations are serializable).
 */
export const bumpActivityByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    /** How many memories this write represents (connector syncs report
     *  their whole batch in one bump). Default 1. */
    count: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return false;

    const now = Date.now();
    const existing = await getStateRow(ctx, user._id);
    const newMemoryCount =
      (existing?.newMemoryCount ?? 0) +
      Math.max(1, Math.trunc(args.count ?? 1));

    const automaticEnabled = await isAutomaticEnabled(ctx, user._id);
    const shouldSchedule =
      automaticEnabled &&
      !(existing?.checkPending ?? false) &&
      newMemoryCount >= MIN_NEW_MEMORIES;

    if (existing) {
      await ctx.db.patch(existing._id, {
        newMemoryCount,
        lastWriteAt: now,
        checkPending: existing.checkPending || shouldSchedule,
      });
    } else {
      await ctx.db.insert("dreamTriggerState", {
        userId: user._id,
        newMemoryCount,
        lastWriteAt: now,
        checkPending: shouldSchedule,
        runsToday: 0,
        dayKey: dayKeyForUtc(now),
      });
    }

    return shouldSchedule;
  },
});

/**
 * Everything the debounced check needs in one query: the state snapshot
 * (shape of `DreamTriggerSnapshot`) plus the automatic-mode setting.
 * Null when the user or state row doesn't exist — nothing to decide on.
 */
export const getDecisionInputsInternal = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      automaticEnabled: v.boolean(),
      state: v.object({
        newMemoryCount: v.number(),
        lastWriteAt: v.number(),
        lastAutoRunAt: v.union(v.number(), v.null()),
        runsToday: v.number(),
        dayKey: v.string(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return null;
    const state = await getStateRow(ctx, user._id);
    if (!state) return null;
    return {
      userId: user._id,
      automaticEnabled: await isAutomaticEnabled(ctx, user._id),
      state: {
        newMemoryCount: state.newMemoryCount,
        lastWriteAt: state.lastWriteAt,
        lastAutoRunAt: state.lastAutoRunAt ?? null,
        runsToday: state.runsToday,
        dayKey: state.dayKey,
      },
    };
  },
});

async function patchState(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<Doc<"dreamTriggerState">>,
): Promise<void> {
  const state = await getStateRow(ctx, userId);
  if (state) await ctx.db.patch(state._id, patch);
}

/** Stand down: the check decided not to dream. The counter persists so
 *  the next memory write re-arms the check with progress intact. */
export const clearPendingInternal = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchState(ctx, args.userId, { checkPending: false });
    return null;
  },
});

/** Consume the trigger for an automatic run: reset the counter, stamp
 *  the run for gap/cap accounting, and clear the pending flag. */
export const consumeRunInternal = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await getStateRow(ctx, args.userId);
    if (!state) return null;
    const now = Date.now();
    const dayKey = dayKeyForUtc(now);
    await ctx.db.patch(state._id, {
      newMemoryCount: 0,
      checkPending: false,
      lastAutoRunAt: now,
      runsToday: state.dayKey === dayKey ? state.runsToday + 1 : 1,
      dayKey,
    });
    return null;
  },
});
