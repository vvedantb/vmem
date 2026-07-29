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
  // absent = true: dynamic dreaming on by default (soft-fails without openRouter key, so default on costs nothing for unconfigured users)
  return settings?.dreamModeAutomatic ?? true;
}

// record a memory write
export const bumpActivityByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    // how many memories this write represents (connector syncs report their whole batch in one bump)
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

// everything the debounced check needs in one query
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

// stand down, the check decided not to dream
export const clearPendingInternal = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchState(ctx, args.userId, { checkPending: false });
    return null;
  },
});

// consume the trigger for an automatic run
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
