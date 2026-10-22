import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { authQuery } from "./auth";
import { runAssertProfileAccessInternal } from "./teams/auth";
import { rollupFields, rollupPeriodValidator } from "./validators";
import { MEMORY_SNIPPET_CHARS } from "../engine/memory/rollupPrompt";
import { yesterdayDayKey } from "../engine/memory/rollupPeriod";
import { rollupDayResultValidator, runRollupDay } from "./rollupActions";

const WINDOW_MEMORY_CAP = 200;
const WINDOW_TRACE_CAP = 500;
const TRACE_SUMMARY_CHARS = 120;
const LIST_CAP = 31;

const rollupMemoryValidator = v.object({
  memoryId: v.string(),
  profileId: v.optional(v.string()),
  title: v.string(),
  content: v.string(),
  source: v.string(),
  sourceType: v.optional(v.string()),
  status: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  usefulnessScore: v.optional(v.number()),
  isFile: v.boolean(),
});

const dayActivityValidator = v.object({
  fallbackProfileId: v.optional(v.string()),
  profiles: v.array(
    v.object({
      profileId: v.id("profiles"),
      teamId: v.optional(v.id("teams")),
    }),
  ),
  memories: v.array(rollupMemoryValidator),
  traces: v.array(
    v.object({
      tool: v.string(),
      ok: v.boolean(),
      summary: v.string(),
      profileId: v.optional(v.string()),
    }),
  ),
});

export type DayActivity = Infer<typeof dayActivityValidator>;

function toRollupMemory(
  doc: Doc<"memories">,
): Infer<typeof rollupMemoryValidator> {
  return {
    memoryId: doc.memoryId,
    profileId: doc.profileId,
    title: doc.title,
    content: doc.content.slice(0, MEMORY_SNIPPET_CHARS),
    source: doc.source,
    sourceType: doc.sourceType,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    usefulnessScore: doc.usefulnessScore,
    isFile: doc.storageId !== undefined,
  };
}

// null when the user did nothing in the window: three .first() reads, no scan
export const loadDayActivityInternal = internalQuery({
  args: { userId: v.id("users"), startMs: v.number(), endMs: v.number() },
  returns: v.union(dayActivityValidator, v.null()),
  handler: async (ctx, { userId, startMs, endMs }) => {
    // memories key on the clerk id; traces need one too, so no clerk id = idle
    const clerkId = (await ctx.db.get(userId))?.clerkId;
    if (!clerkId) return null;
    const created = () =>
      ctx.db
        .query("memories")
        .withIndex("by_user_created", (q) =>
          q
            .eq("userId", clerkId)
            .gte("createdAt", startMs)
            .lt("createdAt", endMs),
        );
    const updated = () =>
      ctx.db
        .query("memories")
        .withIndex("by_user_updated", (q) =>
          q
            .eq("userId", clerkId)
            .gte("updatedAt", startMs)
            .lt("updatedAt", endMs),
        );
    const traces = () =>
      ctx.db
        .query("mcpTraces")
        .withIndex("by_user_created", (q) =>
          q
            .eq("userId", userId)
            .gte("createdAt", startMs)
            .lt("createdAt", endMs),
        );
    const [firstCreated, firstUpdated, firstTrace] = await Promise.all([
      created().first(),
      updated().first(),
      traces().first(),
    ]);
    if (!firstCreated && !firstUpdated && !firstTrace) return null;

    const [createdRows, updatedRows, traceRows] = await Promise.all([
      created().take(WINDOW_MEMORY_CAP),
      updated().take(WINDOW_MEMORY_CAP),
      traces().take(WINDOW_TRACE_CAP),
    ]);
    const memories = new Map<Id<"memories">, Doc<"memories">>();
    for (const doc of [...createdRows, ...updatedRows])
      memories.set(doc._id, doc);

    const fallback = await ctx.db
      .query("profiles")
      .withIndex("by_user_default", (q) =>
        q.eq("userId", userId).eq("isDefault", true),
      )
      .first();
    const profileKeys = new Set<string>([
      ...[...memories.values()].flatMap((m) => m.profileId ?? []),
      ...traceRows.flatMap((t) => t.profileId ?? []),
      ...(fallback ? [fallback._id] : []),
    ]);
    const profiles = [];
    for (const key of profileKeys) {
      const id = ctx.db.normalizeId("profiles", key);
      const profile = id ? await ctx.db.get(id) : null;
      if (profile)
        profiles.push({ profileId: profile._id, teamId: profile.teamId });
    }

    return {
      fallbackProfileId: fallback?._id,
      profiles,
      memories: [...memories.values()].map(toRollupMemory),
      traces: traceRows.map((t) => ({
        tool: t.tool,
        ok: t.ok,
        summary: t.summary.slice(0, TRACE_SUMMARY_CHARS),
        profileId: t.profileId,
      })),
    };
  },
});

// idempotent per (user, profile, period, periodKey). A failed rerun never
// overwrites an ok row.
export const upsertInternal = internalMutation({
  args: rollupFields,
  returns: v.id("rollups"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rollups")
      .withIndex("by_profile_periodKey", (q) =>
        q
          .eq("profileId", args.profileId)
          .eq("period", args.period)
          .eq("periodKey", args.periodKey),
      )
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();
    if (!existing) {
      return await ctx.db.insert("rollups", args);
    }
    if (args.status !== "ok" && existing.status === "ok") return existing._id;
    await ctx.db.replace(existing._id, args);
    return existing._id;
  },
});

const rollupRowValidator = v.object({
  _id: v.id("rollups"),
  _creationTime: v.number(),
  ...rollupFields,
});

// the caller's rollups on one profile with startMs in [startMs, endMs),
// oldest first, at most 31 (a month of days)
export const listForProfile = authQuery({
  args: {
    profileId: v.id("profiles"),
    period: rollupPeriodValidator,
    startMs: v.number(),
    endMs: v.number(),
  },
  returns: v.array(rollupRowValidator),
  handler: async (ctx, args) => {
    await runAssertProfileAccessInternal(ctx, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    // team profiles hold every member's rows; keep the caller's
    return await ctx.db
      .query("rollups")
      .withIndex("by_profile_period", (q) =>
        q
          .eq("profileId", args.profileId)
          .eq("period", args.period)
          .gte("startMs", args.startMs)
          .lt("startMs", args.endMs),
      )
      .filter((q) => q.eq(q.field("userId"), ctx.userId))
      .take(LIST_CAP);
  },
});

// manual run for one user-day (default yesterday utc); ignores the opt-in
// and NIGHTLY_DISABLED:
//   npx convex run rollups:runDayForUserInternal '{"userId":"…","dayKey":"2026-10-21"}'
export const runDayForUserInternal = internalAction({
  args: { userId: v.id("users"), dayKey: v.optional(v.string()) },
  returns: rollupDayResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof rollupDayResultValidator>> =>
    await runRollupDay(ctx, {
      userId: args.userId,
      dayKey: args.dayKey ?? yesterdayDayKey(Date.now()),
    }),
});
