import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { authQuery, getUserByClerkId } from "./auth";
import { toMemorySummary } from "./memoryStore/mappers";
import { runAssertProfileAccessInternal } from "./teams/auth";
import {
  memorySummaryValidator,
  rollupFields,
  rollupPeriodValidator,
} from "./validators";
import { MEMORY_SNIPPET_CHARS } from "../engine/memory/rollupPrompt";
import {
  coarsestFittingPeriod,
  MAX_PERIOD_MS,
  type RollupPeriod,
  summaryPeriodSources,
  summaryPeriodWindow,
  yesterdayDayKey,
} from "@vmem/shared";
import {
  rollupResultValidator,
  runRollupDay,
  runRollupPeriod,
} from "./rollupActions";
import { truncateWellFormed } from "./lib/wellFormed";

const WINDOW_MEMORY_CAP = 200;
const WINDOW_TRACE_CAP = 500;
const TRACE_SUMMARY_CHARS = 120;
const LIST_CAP = 31;
// day + week rows one user can have in a month, across all profiles
const SOURCE_ROW_CAP = 1_000;

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
    content: truncateWellFormed(doc.content, MEMORY_SNIPPET_CHARS),
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
        summary: truncateWellFormed(t.summary, TRACE_SUMMARY_CHARS),
        profileId: t.profileId,
      })),
    };
  },
});

const summaryPeriodValidator = v.union(v.literal("week"), v.literal("month"));

const periodSourceValidator = v.object({
  profileId: v.id("profiles"),
  teamId: v.optional(v.id("teams")),
  period: v.union(v.literal("day"), v.literal("week")),
  periodKey: v.string(),
  startMs: v.number(),
  summary: v.string(),
  highlights: v.array(v.string()),
  memoryIds: v.array(v.string()),
  stats: rollupFields.stats,
});

// the user's ok day / week rows a week or month is built from
// (summaryPeriodSources). Reads rollups only, never memories.
export const loadPeriodSourcesInternal = internalQuery({
  args: {
    userId: v.id("users"),
    period: summaryPeriodValidator,
    periodKey: v.string(),
  },
  returns: v.array(periodSourceValidator),
  handler: async (ctx, args) => {
    const window = summaryPeriodWindow(args.period, args.periodKey);
    const { weekKeys, dayKeys } = summaryPeriodSources(
      args.period,
      args.periodKey,
    );
    const rowsOf = async (period: "day" | "week", keys: string[]) => {
      if (keys.length === 0) return [];
      const wanted = new Set(keys);
      const rows = await ctx.db
        .query("rollups")
        .withIndex("by_user_period", (q) =>
          q
            .eq("userId", args.userId)
            .eq("period", period)
            .gte("startMs", window.startMs)
            .lt("startMs", window.endMs),
        )
        .take(SOURCE_ROW_CAP);
      return rows.flatMap((row) =>
        row.status === "ok" && row.profileId && wanted.has(row.periodKey)
          ? [
              {
                profileId: row.profileId,
                teamId: row.teamId,
                period,
                periodKey: row.periodKey,
                startMs: row.startMs,
                summary: row.summary,
                highlights: row.highlights,
                memoryIds: row.memoryIds,
                stats: row.stats,
              },
            ]
          : [],
      );
    };
    return [
      ...(await rowsOf("week", weekKeys)),
      ...(await rowsOf("day", dayKeys)),
    ];
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

const rollupWindowArgs = {
  startMs: v.number(),
  endMs: v.number(),
  // omit for the coarsest period that fits the window
  period: v.optional(rollupPeriodValidator),
};

const rollupWindowResultValidator = v.object({
  period: rollupPeriodValidator,
  rollups: v.array(rollupRowValidator),
});

// the user's ok rows that overlap [startMs, endMs), oldest first, at most
// `limit` (the newest ones). Reads rollups only: no LLM call on read.
async function readRollupWindow(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    profileId: Id<"profiles">;
    startMs: number;
    endMs: number;
    period?: RollupPeriod;
    limit: number;
  },
): Promise<Infer<typeof rollupWindowResultValidator>> {
  const period = args.period ?? coarsestFittingPeriod(args);
  const rows = await ctx.db
    .query("rollups")
    .withIndex("by_profile_period", (q) =>
      q
        .eq("profileId", args.profileId)
        .eq("period", period)
        .gt("startMs", args.startMs - MAX_PERIOD_MS)
        .lt("startMs", args.endMs),
    )
    .order("desc")
    // team profiles hold every member's rows; keep the caller's
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("status"), "ok"),
        q.gt(q.field("endMs"), args.startMs),
      ),
    )
    .take(args.limit);
  return { period, rollups: rows.reverse() };
}

// the caller's rollups on one profile that overlap [startMs, endMs)
export const getRollups = authQuery({
  args: { profileId: v.id("profiles"), ...rollupWindowArgs },
  returns: rollupWindowResultValidator,
  handler: async (ctx, args) => {
    await runAssertProfileAccessInternal(ctx, {
      profileId: args.profileId,
      userId: ctx.userId,
    });
    return await readRollupWindow(ctx, {
      ...args,
      userId: ctx.userId,
      limit: LIST_CAP,
    });
  },
});

async function requireMcpReader(
  ctx: QueryCtx,
  args: { clerkId: string; profileId: string },
) {
  const user = await getUserByClerkId(ctx, args.clerkId);
  if (!user) throw new Error("User not found");
  const profile = await runAssertProfileAccessInternal(ctx, {
    profileId: args.profileId,
    userId: user._id,
  });
  return { user, profile };
}

// mcp memory_timeline (window) and context_pack periodSummaries
export const getRollupsInternal = internalQuery({
  args: {
    clerkId: v.string(),
    profileId: v.string(),
    ...rollupWindowArgs,
    limit: v.optional(v.number()),
  },
  returns: rollupWindowResultValidator,
  handler: async (ctx, args) => {
    const { user, profile } = await requireMcpReader(ctx, args);
    return await readRollupWindow(ctx, {
      ...args,
      userId: user._id,
      profileId: profile._id,
      limit: Math.min(args.limit ?? LIST_CAP, LIST_CAP),
    });
  },
});

// newest rows per period that ended at or before the date
const KNOWN_AT_CAPS: Record<RollupPeriod, number> = {
  month: 3,
  week: 4,
  day: 7,
};
const KNOWN_AT_MEMORY_CAP = 20;

// "what was known at date X": rollups are frozen snapshots, so they show what
// was believed then. Memories have no version history: the rows created
// before X (minus suppressed ones) are an approximation with today's text.
export const knownAtInternal = internalQuery({
  args: { clerkId: v.string(), profileId: v.string(), atMs: v.number() },
  returns: v.object({
    rollups: v.array(rollupRowValidator),
    memories: v.array(memorySummaryValidator),
  }),
  handler: async (ctx, args) => {
    const { user, profile } = await requireMcpReader(ctx, args);
    const periods: RollupPeriod[] = ["month", "week", "day"];
    const rollups = [];
    for (const period of periods) {
      const rows = await ctx.db
        .query("rollups")
        .withIndex("by_profile_period", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("period", period)
            .lt("startMs", args.atMs),
        )
        .order("desc")
        .filter((q) =>
          q.and(
            q.eq(q.field("userId"), user._id),
            q.eq(q.field("status"), "ok"),
            q.lte(q.field("endMs"), args.atMs),
          ),
        )
        .take(KNOWN_AT_CAPS[period]);
      rollups.push(...rows);
    }
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_profile_created", (q) =>
        q.eq("profileId", profile._id).lt("createdAt", args.atMs),
      )
      .order("desc")
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "suppressed"),
          // a personal profile only holds its owner's rows; team rows are shared
          profile.teamId === undefined
            ? q.eq(q.field("userId"), user.clerkId)
            : true,
        ),
      )
      .take(KNOWN_AT_MEMORY_CAP);
    return { rollups, memories: memories.map(toMemorySummary) };
  },
});

// manual run for one user-day (default yesterday utc); ignores the opt-in
// and NIGHTLY_DISABLED:
//   npx convex run rollups:runDayForUserInternal '{"userId":"…","dayKey":"2026-10-21"}'
export const runDayForUserInternal = internalAction({
  args: { userId: v.id("users"), dayKey: v.optional(v.string()) },
  returns: rollupResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof rollupResultValidator>> =>
    await runRollupDay(ctx, {
      userId: args.userId,
      dayKey: args.dayKey ?? yesterdayDayKey(Date.now()),
    }),
});

// manual (re)build of one week or month from stored rows, e.g. a backfill
// after day rows exist; ignores the opt-in and NIGHTLY_DISABLED:
//   npx convex run rollups:runPeriodForUserInternal '{"userId":"…","period":"week","periodKey":"2026-W43"}'
export const runPeriodForUserInternal = internalAction({
  args: {
    userId: v.id("users"),
    period: summaryPeriodValidator,
    periodKey: v.string(),
  },
  returns: rollupResultValidator,
  handler: async (ctx, args): Promise<Infer<typeof rollupResultValidator>> =>
    await runRollupPeriod(ctx, args),
});
