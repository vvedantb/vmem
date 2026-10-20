import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { v, type Infer, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import { authQuery } from "./auth";
import { openRouterLogFields, openRouterLogRecordFields } from "./validators";
import type { Id } from "./_generated/dataModel";
import { getMembershipOrNull } from "./teams/auth";
import { getUserIdByClerkId } from "./lib/clerkUser";
import {
  mcpScopeValidator,
  requireProfileForMcpScope,
  resolveMcpTeamId,
} from "./profiles/mcpAccess";
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
    // normalise the string profileId from the caller into a typed Id<"profiles">
    const { profileId: rawProfileId, ...rest } = args;
    const profileId = rawProfileId
      ? (ctx.db.normalizeId("profiles", rawProfileId) ?? undefined)
      : undefined;

    let teamId: Id<"teams"> | undefined;
    if (profileId) {
      const profile = await ctx.db.get(profileId);
      if (profile?.teamId) teamId = profile.teamId;
    }
    await ctx.db.insert("openRouterLogs", {
      ...rest,
      profileId,
      teamId,
      createdAt: Date.now(),
      aggregatePending: true,
    });
    return null;
  },
});

const AGGREGATE_DRAIN_BATCH = 25;

// Log writes stay append-only so concurrent LLM calls never contend on the
// aggregate btree roots; this folds pending rows in, one writer at a time.
export const drainAggregatesInternal = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("openRouterLogs")
      .withIndex("by_aggregate_pending", (q) => q.eq("aggregatePending", true))
      .take(AGGREGATE_DRAIN_BATCH);
    for (const doc of pending) {
      await insertOpenRouterLogAggregates(ctx, doc);
      await ctx.db.patch(doc._id, { aggregatePending: undefined });
    }
    if (pending.length === AGGREGATE_DRAIN_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.openRouterLogs.drainAggregatesInternal,
        {},
      );
    }
    return pending.length;
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

type Range = Infer<typeof rangeValidator>;

function rangeCutoff(range: Range): number | null {
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

// resolve + authorize the team for a team-scoped read. on denied + "empty": missing teamId and non-member both become null instead of throw
async function resolveAuthorizedTeamId(
  ctx: QueryCtx,
  opts: {
    userId: Id<"users">;
    teamId?: Id<"teams">;
    onDenied: "throw" | "empty";
  },
): Promise<Id<"teams"> | null> {
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
  return teamId;
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
    const teamId = await resolveAuthorizedTeamId(ctx, opts);
    if (!teamId) return null;
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
  const teamId = await resolveAuthorizedTeamId(ctx, opts);
  if (!teamId) return null;
  return teamLogNamespace(teamId);
}

const listMineFilterArgs = {
  profileId: v.optional(v.id("profiles")),
  features: v.optional(v.array(openRouterLogFields.feature)),
  models: v.optional(v.array(v.string())),
  range: v.optional(rangeValidator),
};

type LogOwner = {
  userId: Id<"users">;
  scope: "personal" | "team";
  teamId?: Id<"teams">;
};

async function listLogsPage(
  ctx: QueryCtx,
  owner: LogOwner,
  args: ObjectType<typeof listMineFilterArgs> & {
    paginationOpts: PaginationOptions;
  },
) {
  const features = args.features ?? [];
  const models = args.models ?? [];
  const range = args.range ?? "all";
  const cutoff = rangeCutoff(range);

  let q = await scopedOpenRouterLogsQuery(ctx, {
    ...owner,
    cutoff,
    onDenied: "throw",
  });
  if (!q) {
    throw new Error("Not authorized for this team");
  }

  // optional profile filter, works for both scopes
  if (args.profileId) {
    const profileId = args.profileId;
    q = q.filter((f) => f.eq(f.field("profileId"), profileId));
  }

  // multi value filters, features[], models[]
  if (features.length > 0) {
    q = q.filter((f) =>
      f.or(...features.map((feat) => f.eq(f.field("feature"), feat))),
    );
  }
  if (models.length > 0) {
    q = q.filter((f) => f.or(...models.map((m) => f.eq(f.field("model"), m))));
  }

  return await q.paginate(args.paginationOpts);
}

export const listMine = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
    ...listMineFilterArgs,
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
  handler: async (ctx, { scope, teamId, ...args }) =>
    listLogsPage(
      ctx,
      { userId: ctx.userId, scope: scope ?? "personal", teamId },
      args,
    ),
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
  handler: async (ctx, args) =>
    summarizeLogs(
      ctx,
      {
        userId: ctx.userId,
        scope: args.scope ?? "personal",
        teamId: args.teamId,
      },
      args.range,
    ),
});

async function summarizeLogs(
  ctx: QueryCtx,
  owner: LogOwner,
  rangeArg: Range | undefined,
) {
  const range = rangeArg ?? "today";
  const cutoff = rangeCutoff(range);
  const namespace = await resolveOwnerNamespace(ctx, {
    ...owner,
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
}

export const distinctModelsMine = authQuery({
  args: {
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) =>
    distinctModels(ctx, {
      userId: ctx.userId,
      scope: args.scope ?? "personal",
      teamId: args.teamId,
    }),
});

async function distinctModels(
  ctx: QueryCtx,
  owner: LogOwner,
): Promise<string[]> {
  const namespace = await resolveOwnerNamespace(ctx, {
    ...owner,
    onDenied: "empty",
  });
  if (namespace === null) return [];

  const models: string[] = [];
  for await (const item of openRouterModels.iter(ctx, { namespace })) {
    models.push(item.key);
  }
  return models.sort();
}

// MCP usage_ai_*: personal logs, or on the team connector the active team
// profile's team (never a teamId param)
async function mcpLogOwner(
  ctx: QueryCtx,
  args: { clerkId: string; scope: "personal" | "team" },
): Promise<LogOwner> {
  return {
    userId: await getUserIdByClerkId(ctx, args.clerkId),
    scope: args.scope,
    teamId: await resolveMcpTeamId(ctx, args.clerkId, args.scope),
  };
}

const mcpLogScopeArgs = { clerkId: v.string(), scope: mcpScopeValidator };

export const listByClerkIdInternal = internalQuery({
  args: {
    ...mcpLogScopeArgs,
    paginationOpts: paginationOptsValidator,
    profileId: v.optional(v.string()),
    features: listMineFilterArgs.features,
    models: listMineFilterArgs.models,
    range: listMineFilterArgs.range,
  },
  handler: async (ctx, { clerkId, scope, profileId, ...args }) => {
    const profile =
      profileId === undefined
        ? undefined
        : await requireProfileForMcpScope(ctx, clerkId, scope, profileId);
    return listLogsPage(ctx, await mcpLogOwner(ctx, { clerkId, scope }), {
      ...args,
      profileId: profile?._id,
    });
  },
});

export const summaryByClerkIdInternal = internalQuery({
  args: { ...mcpLogScopeArgs, range: v.optional(rangeValidator) },
  handler: async (ctx, args) =>
    summarizeLogs(ctx, await mcpLogOwner(ctx, args), args.range),
});

export const distinctModelsByClerkIdInternal = internalQuery({
  args: mcpLogScopeArgs,
  handler: async (ctx, args) =>
    distinctModels(ctx, await mcpLogOwner(ctx, args)),
});
