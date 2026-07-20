import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authQuery } from "./auth";
import { openRouterLogFields, openRouterLogRecordFields } from "./validators";
import type { Id } from "./_generated/dataModel";
import { getMembershipOrNull } from "./teams/auth";
import {
  insertOpenRouterLogAggregates,
  openRouterCost,
  openRouterModels,
  openRouterTokens,
  teamLogNamespace,
  userLogNamespace,
} from "./openRouterAggregates";

export const recordInternal = internalMutation({
  args: openRouterLogRecordFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    // normalise the string profileId from the caller into a typed Convex Id<"profiles">
    const { profileId: rawProfileId, ...rest } = args;
    const profileId = rawProfileId
      ? (ctx.db.normalizeId("profiles", rawProfileId) ?? undefined)
      : undefined;

    let teamId: Id<"teams"> | undefined;
    if (profileId) {
      const profile = await ctx.db.get(profileId);
      if (profile?.teamId) teamId = profile.teamId;
    }
    const id = await ctx.db.insert("openRouterLogs", {
      ...rest,
      profileId,
      teamId,
      createdAt: Date.now(),
    });
    const doc = await ctx.db.get(id);
    if (doc) {
      await insertOpenRouterLogAggregates(ctx, doc, "live");
    }
    return null;
  },
});

const scopeValidator = v.union(v.literal("personal"), v.literal("team"));
const rangeValidator = v.union(
  v.literal("today"),
  v.literal("7d"),
  v.literal("30d"),
  v.literal("all"),
);

const logRowValidator = v.object({
  _id: v.id("openRouterLogs"),
  _creationTime: v.number(),
  ...openRouterLogFields,
});

function rangeCutoff(range: "today" | "7d" | "30d" | "all"): number | null {
  const now = Date.now();
  switch (range) {
    case "today":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return null;
  }
}

async function scopedOpenRouterLogsQuery(
  ctx: QueryCtx,
  opts: {
    userId: Id<"users">;
    scope: "personal" | "team";
    teamId?: Id<"teams">;
    cutoff: number | null;
    onDenied: "throw" | "empty";
  },
) {
  if (opts.scope === "team") {
    const teamId = opts.teamId;
    if (!teamId) {
      if (opts.onDenied === "empty") return null;
      throw new Error("Team scope requires teamId");
    }
    const membership = await getMembershipOrNull(ctx, teamId, opts.userId);
    if (!membership) {
      if (opts.onDenied === "empty") return null;
      throw new Error("Not authorized for this team");
    }
    return ctx.db
      .query("openRouterLogs")
      .withIndex("by_team_createdAt", (idx) =>
        opts.cutoff !== null
          ? idx.eq("teamId", teamId).gte("createdAt", opts.cutoff)
          : idx.eq("teamId", teamId),
      )
      .order("desc");
  }

  return ctx.db
    .query("openRouterLogs")
    .withIndex("by_user_createdAt", (idx) =>
      opts.cutoff !== null
        ? idx.eq("userId", opts.userId).gte("createdAt", opts.cutoff)
        : idx.eq("userId", opts.userId),
    )
    .order("desc");
}

async function resolveOwnerNamespace(
  ctx: QueryCtx,
  opts: {
    userId: Id<"users">;
    scope: "personal" | "team";
    teamId?: Id<"teams">;
    onDenied: "throw" | "empty";
  },
): Promise<string | null> {
  if (opts.scope === "personal") {
    return userLogNamespace(opts.userId);
  }
  const teamId = opts.teamId;
  if (!teamId) {
    if (opts.onDenied === "empty") return null;
    throw new Error("Team scope requires teamId");
  }
  const membership = await getMembershipOrNull(ctx, teamId, opts.userId);
  if (!membership) {
    if (opts.onDenied === "empty") return null;
    throw new Error("Not authorized for this team");
  }
  return teamLogNamespace(teamId);
}

export const listMine = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
    profileId: v.optional(v.id("profiles")),
    features: v.optional(v.array(openRouterLogFields.feature)),
    models: v.optional(v.array(v.string())),
    range: v.optional(rangeValidator),
  },
  returns: v.object({
    page: v.array(logRowValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    pageStatus: v.optional(
      v.union(
        v.null(),
        v.literal("SplitRecommended"),
        v.literal("SplitRequired"),
      ),
    ),
    splitCursor: v.optional(v.union(v.null(), v.string())),
  }),
  handler: async (ctx, args) => {
    const scope = args.scope ?? "personal";
    const features = args.features ?? [];
    const models = args.models ?? [];
    const range = args.range ?? "all";
    const cutoff = rangeCutoff(range);

    let q = await scopedOpenRouterLogsQuery(ctx, {
      userId: ctx.userId,
      scope,
      teamId: args.teamId,
      cutoff,
      onDenied: "throw",
    });
    if (!q) {
      throw new Error("Not authorized for this team");
    }

    // optional profile filter — works for both scopes
    if (args.profileId) {
      const profileId = args.profileId;
      q = q.filter((f) => f.eq(f.field("profileId"), profileId));
    }

    // multi-value filters: features[], models[]
    if (features.length > 0) {
      q = q.filter((f) =>
        f.or(...features.map((feat) => f.eq(f.field("feature"), feat))),
      );
    }
    if (models.length > 0) {
      q = q.filter((f) =>
        f.or(...models.map((m) => f.eq(f.field("model"), m))),
      );
    }

    return await q.paginate(args.paginationOpts);
  },
});

const summaryReturnValidator = v.object({
  totalCalls: v.number(),
  totalCostUsd: v.number(),
  totalTokens: v.number(),
});

export const summaryMine = authQuery({
  args: {
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
    range: v.optional(rangeValidator),
  },
  returns: summaryReturnValidator,
  handler: async (ctx, args) => {
    const scope = args.scope ?? "personal";
    const range = args.range ?? "today";
    const cutoff = rangeCutoff(range);
    const namespace = await resolveOwnerNamespace(ctx, {
      userId: ctx.userId,
      scope,
      teamId: args.teamId,
      onDenied: "throw",
    });
    if (namespace === null) {
      throw new Error("Not authorized for this team");
    }

    const bounds =
      cutoff === null ? undefined : { lower: { key: cutoff, inclusive: true } };

    const [totalCalls, totalCostUsd, totalTokens] = await Promise.all([
      openRouterCost.count(ctx, { namespace, bounds }),
      openRouterCost.sum(ctx, { namespace, bounds }),
      openRouterTokens.sum(ctx, { namespace, bounds }),
    ]);

    return { totalCalls, totalCostUsd, totalTokens };
  },
});

export const distinctModelsMine = authQuery({
  args: {
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const scope = args.scope ?? "personal";
    const namespace = await resolveOwnerNamespace(ctx, {
      userId: ctx.userId,
      scope,
      teamId: args.teamId,
      onDenied: "empty",
    });
    if (namespace === null) return [];

    const models: string[] = [];
    for await (const item of openRouterModels.iter(ctx, { namespace })) {
      models.push(item.key);
    }
    return models.sort();
  },
});

/** One-shot / resume: backfill aggregates for existing openRouterLogs rows. */
export const backfillAggregatesPage = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("openRouterLogs").paginate({
      numItems: 100,
      cursor: args.cursor ?? null,
    });
    for (const doc of page.page) {
      await insertOpenRouterLogAggregates(ctx, doc, "backfill");
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.openRouterLogs.backfillAggregatesPage,
        { cursor: page.continueCursor },
      );
    }
    return null;
  },
});
