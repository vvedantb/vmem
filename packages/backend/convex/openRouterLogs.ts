import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, type QueryCtx } from "./_generated/server";
import { authQuery } from "./auth";
import { openRouterLogFields, openRouterLogRecordFields } from "./validators";
import type { Id } from "./_generated/dataModel";
import { getMembershipOrNull } from "./teams/auth";

/**
 * OpenRouter call logs — backing table for the `/openrouter-logs`
 * dashboard route.
 *
 * - `recordInternal` is fired (via `ctx.scheduler.runAfter(0, …)`) by
 *   the shared OpenRouter wrapper after every chat or embedding call.
 *   It derives the row's `teamId` from the supplied `profileId` so the
 *   single `by_team_createdAt` index can serve team-wide spend queries.
 * - `listMine` and `summaryMine` are auth-scoped reads. They never
 *   accept an `actorId` from the caller — the userId is pinned to
 *   `ctx.userId`, which the `authQuery` builder resolves from the
 *   Clerk identity. Team scope additionally checks `teamMembers` for
 *   membership before returning rows.
 */

// ─────────────────────────────────────────────────────────────────────
// recordInternal
// ─────────────────────────────────────────────────────────────────────

/**
 * Insert one OpenRouter call log row. Resolves `teamId` from
 * `profileId` at write-time so the dashboard's team-spend queries hit
 * a single `by_team_createdAt` index without needing to join.
 */
export const recordInternal = internalMutation({
  args: openRouterLogRecordFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    // Normalise the string profileId from the caller into a typed
    // Convex Id<"profiles">. Returns null for malformed strings — we
    // treat that as "no profile" so a bad id never blocks the log row.
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
    });
    return null;
  },
});

// ─────────────────────────────────────────────────────────────────────
// listMine
// ─────────────────────────────────────────────────────────────────────

const scopeValidator = v.union(v.literal("personal"), v.literal("team"));
const statusFilterValidator = v.union(
  v.literal("all"),
  v.literal("success"),
  v.literal("error"),
);
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

/**
 * Shared personal/team index selection + membership gate for OpenRouter
 * log reads. Returns null when `onDenied: "empty"` and auth fails.
 */
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

/**
 * Paginated list of the current user's OpenRouter call logs.
 *
 * Personal scope reads `by_user_createdAt` (own rows only). Team scope
 * requires a `teamId` and reads `by_team_createdAt` after verifying
 * membership via `teamMembers.by_team_user`.
 *
 * Filters compose with AND. Multi-value filters (`features`, `models`)
 * fall back to no-op when the array is empty so the index can still
 * be used efficiently.
 */
export const listMine = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
    profileId: v.optional(v.id("profiles")),
    features: v.optional(v.array(openRouterLogFields.feature)),
    models: v.optional(v.array(v.string())),
    status: v.optional(statusFilterValidator),
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
    const status = args.status ?? "all";
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

    // Optional profile filter — works for both scopes.
    if (args.profileId) {
      const profileId = args.profileId;
      q = q.filter((f) => f.eq(f.field("profileId"), profileId));
    }

    // Multi-value filters: features[], models[].
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

    // Status filter — success / error / all.
    if (status === "success") {
      q = q.filter((f) => f.eq(f.field("ok"), true));
    } else if (status === "error") {
      q = q.filter((f) => f.eq(f.field("ok"), false));
    }

    return await q.paginate(args.paginationOpts);
  },
});

// ─────────────────────────────────────────────────────────────────────
// summaryMine
// ─────────────────────────────────────────────────────────────────────

const summaryReturnValidator = v.object({
  totalCalls: v.number(),
  totalCostUsd: v.number(),
  totalTokens: v.number(),
  avgLatencyMs: v.number(),
  successRate: v.number(),
  isApprox: v.boolean(),
});

/**
 * Aggregate call stats for the dashboard's stat-card row. Caps the
 * scan at 5k rows; if the cap is hit the response is marked
 * `isApprox: true` so the UI can render a tooltip ("based on most
 * recent 5,000 calls").
 *
 * Mirrors `listMine`'s scope/auth contract but ignores feature/model
 * filters — the cards always show the unfiltered window so users see
 * "today's spend" rather than "today's spend matching the current
 * filter chip set".
 */
export const summaryMine = authQuery({
  args: {
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
    range: v.optional(rangeValidator),
  },
  returns: summaryReturnValidator,
  handler: async (ctx, args) => {
    const SCAN_CAP = 5000;
    const scope = args.scope ?? "personal";
    const range = args.range ?? "today";
    const cutoff = rangeCutoff(range);

    const q = await scopedOpenRouterLogsQuery(ctx, {
      userId: ctx.userId,
      scope,
      teamId: args.teamId,
      cutoff,
      onDenied: "throw",
    });
    if (!q) {
      throw new Error("Not authorized for this team");
    }
    const rows = await q.take(SCAN_CAP);

    let totalCostUsd = 0;
    let totalTokens = 0;
    let totalLatency = 0;
    let okCount = 0;
    for (const row of rows) {
      if (typeof row.costUsd === "number") totalCostUsd += row.costUsd;
      if (typeof row.totalTokens === "number") totalTokens += row.totalTokens;
      totalLatency += row.latencyMs;
      if (row.ok) okCount += 1;
    }

    const totalCalls = rows.length;
    const avgLatencyMs =
      totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;
    const successRate = totalCalls > 0 ? okCount / totalCalls : 1;

    return {
      totalCalls,
      totalCostUsd,
      totalTokens,
      avgLatencyMs,
      successRate,
      isApprox: rows.length === SCAN_CAP,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────
// Helper queries
// ─────────────────────────────────────────────────────────────────────

/** Distinct model strings the user has logged — drives the "Models"
 *  multi-select in the filters dropdown. Caps at the 1000 most recent
 *  rows; new models surface within seconds via Convex's reactive
 *  query subscription. */
export const distinctModelsMine = authQuery({
  args: {
    scope: v.optional(scopeValidator),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const scope = args.scope ?? "personal";

    const q = await scopedOpenRouterLogsQuery(ctx, {
      userId: ctx.userId,
      scope,
      teamId: args.teamId,
      cutoff: null,
      onDenied: "empty",
    });
    if (!q) return [];
    const rows = await q.take(1000);

    const seen = new Set<string>();
    for (const row of rows) seen.add(row.model);
    return Array.from(seen).sort();
  },
});
