import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v, type ObjectType } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import { authQuery, getUserByClerkId } from "./auth";
import {
  canAccessProfileForMcpScope,
  getActiveProfileForMcpScope,
  type McpScope,
} from "./profiles/mcpAccess";
import type { McpTraceBody } from "./mcp/traceSummary";
import { mcpTraceDetailFields, mcpTraceFields } from "./validators";

export const TRACE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 500;

const recordArgs = {
  clerkUserId: v.string(),
  scope: mcpTraceFields.scope,
  tool: mcpTraceFields.tool,
  ok: mcpTraceFields.ok,
  durationMs: mcpTraceFields.durationMs,
  summary: mcpTraceFields.summary,
  resultCount: mcpTraceFields.resultCount,
  createdAt: mcpTraceFields.createdAt,
  profileIdHint: v.optional(v.string()),
  args: mcpTraceDetailFields.args,
  resultIds: mcpTraceDetailFields.resultIds,
  resultPreview: mcpTraceDetailFields.resultPreview,
  error: mcpTraceDetailFields.error,
};

type RecordArgs = ObjectType<typeof recordArgs>;

// the profile a call ran on: the profile the args or result named, if this
// user may use it on this scope, else the active mcp profile
async function resolveTraceProfile(
  ctx: MutationCtx,
  args: { userId: Id<"users">; clerkUserId: string; scope: McpScope },
  profileIdHint: string | undefined,
) {
  const hinted = profileIdHint
    ? ctx.db.normalizeId("profiles", profileIdHint)
    : null;
  if (hinted) {
    const profile = await ctx.db.get(hinted);
    if (
      profile &&
      (await canAccessProfileForMcpScope(ctx, args.userId, profile, args.scope))
    ) {
      return profile;
    }
  }
  return getActiveProfileForMcpScope(ctx, args.clerkUserId, args.scope);
}

export const record = internalMutation({
  args: recordArgs,
  returns: v.null(),
  handler: async (
    ctx,
    {
      clerkUserId,
      profileIdHint,
      args,
      resultIds,
      resultPreview,
      error,
      ...row
    },
  ) => {
    const user = await getUserByClerkId(ctx, clerkUserId);
    if (!user) return null;
    const profile = await resolveTraceProfile(
      ctx,
      { userId: user._id, clerkUserId, scope: row.scope },
      profileIdHint,
    );
    const traceId = await ctx.db.insert("mcpTraces", {
      ...row,
      userId: user._id,
      profileId: profile?._id,
      teamId: profile?.teamId,
    });
    await ctx.db.insert("mcpTraceDetails", {
      traceId,
      userId: user._id,
      args,
      resultIds,
      resultPreview,
      error,
      createdAt: row.createdAt,
    });
    return null;
  },
});

// fire-and-forget like scheduleLog: the call never waits on the write, and a
// tracing failure (including in build) is logged, never thrown to the tool
export async function scheduleMcpTrace(
  ctx: Pick<ActionCtx, "scheduler">,
  call: Pick<RecordArgs, "clerkUserId" | "scope" | "tool" | "ok"> & {
    startedAt: number;
  },
  build: () => McpTraceBody,
): Promise<void> {
  try {
    const { startedAt, ...rest } = call;
    const durationMs = Date.now() - startedAt;
    await ctx.scheduler.runAfter(0, internal.mcpTraces.record, {
      ...rest,
      ...build(),
      durationMs,
      createdAt: startedAt,
    });
  } catch (err) {
    console.error(
      `[MCP][trace][${call.tool}]`,
      err instanceof Error ? err.message : err,
    );
  }
}

const traceRowValidator = v.object({
  _id: v.id("mcpTraces"),
  _creationTime: v.number(),
  ...mcpTraceFields,
});

export const listMine = authQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    tool: v.optional(v.string()),
    ok: v.optional(v.boolean()),
    profileId: v.optional(v.id("profiles")),
  },
  returns: paginationResultValidator(traceRowValidator),
  handler: async (ctx, { paginationOpts, tool, ok, profileId }) => {
    const userId = ctx.userId;
    // team profiles hold every member's traces, so the profile path still
    // filters to the caller
    let q = profileId
      ? ctx.db
          .query("mcpTraces")
          .withIndex("by_profile_created", (idx) =>
            idx.eq("profileId", profileId),
          )
          .order("desc")
          .filter((f) => f.eq(f.field("userId"), userId))
      : ctx.db
          .query("mcpTraces")
          .withIndex("by_user_created", (idx) => idx.eq("userId", userId))
          .order("desc");
    if (tool !== undefined) {
      q = q.filter((f) => f.eq(f.field("tool"), tool));
    }
    if (ok !== undefined) {
      q = q.filter((f) => f.eq(f.field("ok"), ok));
    }
    return await q.paginate(paginationOpts);
  },
});

export const getDetail = authQuery({
  args: { traceId: v.id("mcpTraces") },
  returns: v.union(
    v.object({
      trace: traceRowValidator,
      detail: v.union(
        v.object({
          _id: v.id("mcpTraceDetails"),
          _creationTime: v.number(),
          ...mcpTraceDetailFields,
        }),
        v.null(),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, { traceId }) => {
    const trace = await ctx.db.get(traceId);
    // other users' traces read as missing
    if (!trace || trace.userId !== ctx.userId) return null;
    const detail = await ctx.db
      .query("mcpTraceDetails")
      .withIndex("by_trace", (idx) => idx.eq("traceId", traceId))
      .first();
    return { trace, detail };
  },
});

// hourly ttl sweep; trace and detail share createdAt, so both age out together
export const purgeExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - TRACE_RETENTION_MS;
    const traces = await ctx.db
      .query("mcpTraces")
      .withIndex("by_created", (idx) => idx.lt("createdAt", cutoff))
      .take(PURGE_BATCH);
    const details = await ctx.db
      .query("mcpTraceDetails")
      .withIndex("by_created", (idx) => idx.lt("createdAt", cutoff))
      .take(PURGE_BATCH);
    for (const doc of [...traces, ...details]) {
      await ctx.db.delete(doc._id);
    }
    if (traces.length === PURGE_BATCH || details.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.mcpTraces.purgeExpired, {});
    }
    return traces.length + details.length;
  },
});
