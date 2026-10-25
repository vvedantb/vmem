import { v } from "convex/values";
import { DREAM_DAILY_BUDGET_USD } from "../engine/memory/dream/nightly";
import { judgeDuplicateGroup } from "../engine/memory/dream/jevDuplicate";
import {
  applyTagMerges,
  emptyTagConsolidationCounts,
  planTagAiGroups,
  planTagMerges,
  tagJevMember,
  tagMergeFromVerdict,
  type TagConsolidationCounts,
  type TagCount,
  type TagMerge,
} from "../engine/memory/dream/tagConsolidate";
import { buildSearchableText } from "../engine/memory/searchableText";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { dreamSpentTodayUsd } from "./dream";
import { resolveSystemOneApiKey } from "./lib/systemOneKey";
import { scheduleLog } from "./lib/openRouter/shared";
import { dreamSettingsOf, getSettingsDoc } from "./userSettings";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";

// Tag consolidation: the one shared merge path. Dream Mode (dreaming.ts), the
// one-off cleanup (dreamCleanup.ts apply) and the MCP tool
// memory_tags_consolidate all call consolidateProfileTags.
//
// Two tiers. Deterministic first: it merges host-name spellings that lost
// their dots (`wwwyoutubecom`, `youtubecom`) into the brand (`youtube`); see
// engine/memory/dream/tagConsolidate.ts. Then the AI tier: leftover tags that
// look alike go to Jev (judgeDuplicateGroup, as dream near-dup does) in groups
// of at most four, at most five calls per run. It runs only with a userId,
// AI_GATEWAY_API_KEY, dreamModeUseAi on and today's dream budget left;
// otherwise it is skipped and the run is deterministic only. Pass 1 pages the
// profile and counts tags; pass 2 pages it again and retags only rows that
// carry a loser. Pages are small so each query and mutation stays inside
// Convex read and write limits. A second run finds no deterministic group;
// Jev may judge the same unmerged groups again (at most five calls). Retagging
// does not touch updatedAt, so it does not enter the dream change window, and
// it has no undo: the old spelling is not kept.

const PAGE_SIZE = 100;
const MAX_SCAN_ROWS = 50_000;

const tagMergeValidator = v.object({
  keeper: v.string(),
  losers: v.array(v.string()),
});

const pageArgs = {
  profileId: v.string(),
  cursor: v.union(v.string(), v.null()),
};

const pageMeta = {
  isDone: v.boolean(),
  continueCursor: v.string(),
};

export const tagCountsPageInternal = internalQuery({
  args: pageArgs,
  returns: v.object({
    ...pageMeta,
    rows: v.number(),
    tags: v.array(v.object({ tag: v.string(), count: v.number() })),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("memories")
      .withIndex("by_profile_created", (q) => q.eq("profileId", args.profileId))
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    const counts = new Map<string, number>();
    for (const doc of page.page) {
      for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      rows: page.page.length,
      tags: [...counts].map(([tag, count]) => ({ tag, count })),
    };
  },
});

export const retagPageInternal = internalMutation({
  args: { ...pageArgs, merges: v.array(tagMergeValidator) },
  returns: v.object({ ...pageMeta, retagged: v.number() }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("memories")
      .withIndex("by_profile_created", (q) => q.eq("profileId", args.profileId))
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    let retagged = 0;
    for (const doc of page.page) {
      const tags = applyTagMerges(doc.tags, args.merges);
      if (
        tags.length === doc.tags.length &&
        tags.every((t, i) => t === doc.tags[i])
      ) {
        continue;
      }
      await ctx.db.patch(doc._id, {
        tags,
        searchableText: buildSearchableText(doc.title, doc.content, tags),
      });
      retagged += 1;
    }
    return {
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      retagged,
    };
  },
});

// the AI gate for one user: settings and today's spend, read together
export const tagAiGateInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({ useAi: v.boolean(), spentTodayUsd: v.number() }),
  handler: async (ctx, args) => ({
    useAi: dreamSettingsOf(await getSettingsDoc(ctx, args.userId)).useAi,
    spentTodayUsd: await dreamSpentTodayUsd(ctx),
  }),
});

// adds one dream run's merged-group count to its counts row
export const recordTagMergeInternal = internalMutation({
  args: { runId: v.id("dreamRuns"), groupsMerged: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || args.groupsMerged === 0) return null;
    await ctx.db.patch(run._id, {
      counts: {
        ...run.counts,
        tagsMerged: (run.counts.tagsMerged ?? 0) + args.groupsMerged,
      },
    });
    return null;
  },
});

export type TagConsolidationResult = TagConsolidationCounts & {
  merges: TagMerge[];
};

interface TagAi {
  apiKey: string;
  userId: Id<"users">;
  spentTodayUsd: number;
}

// null: no user, no key, AI off for the user, or the daily budget is spent
async function resolveTagAi(
  ctx: Pick<ActionCtx, "runQuery">,
  userId: Id<"users"> | undefined,
): Promise<TagAi | null> {
  const apiKey = resolveSystemOneApiKey();
  if (apiKey === undefined || userId === undefined) return null;
  const gate = await ctx.runQuery(internal.tagConsolidate.tagAiGateInternal, {
    userId,
  });
  if (!gate.useAi || gate.spentTodayUsd >= DREAM_DAILY_BUDGET_USD) return null;
  return { apiKey, userId, spentTodayUsd: gate.spentTodayUsd };
}

// Jev over the leftover look-alike groups; stops at the budget
async function judgeTagGroups(
  ctx: Pick<ActionCtx, "scheduler">,
  args: { profileId: string; ai: TagAi; groups: TagCount[][] },
): Promise<{ merges: TagMerge[]; calls: number }> {
  const merges: TagMerge[] = [];
  let calls = 0;
  let spent = args.ai.spentTodayUsd;
  for (const group of args.groups) {
    if (spent >= DREAM_DAILY_BUDGET_USD) break;
    const result = await judgeDuplicateGroup({
      members: group.map(tagJevMember),
      apiKey: args.ai.apiKey,
      tag: "dream-tags",
    });
    calls += 1;
    spent += result.costUsd ?? 0;
    await scheduleLog(ctx, {
      userId: args.ai.userId,
      profileId: args.profileId,
      feature: "dream",
      endpoint: "chat",
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      costUsd: result.costUsd,
      ...(result.verdict.status === "error"
        ? { errorMessage: result.verdict.reason }
        : {}),
    });
    const merge = tagMergeFromVerdict(group, result.verdict);
    if (merge !== null) merges.push(merge);
  }
  return { merges, calls };
}

/**
 * Merges duplicate tags of one profile (personal or team): host-name
 * spellings first, then look-alike tags that Jev judges the same. Safe to
 * call twice and from any action. Pass userId to allow the AI tier (see the
 * top of this file); without it only the deterministic tier runs. Pass runId
 * to add the merged groups to that dream run's counts.
 */
export async function consolidateProfileTags(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">,
  args: {
    profileId: string;
    runId?: Id<"dreamRuns">;
    userId?: Id<"users">;
  },
): Promise<TagConsolidationResult> {
  const result = emptyTagConsolidationCounts();
  const tagCounts = new Map<string, number>();
  let cursor: string | null = null;
  for (;;) {
    const page: {
      isDone: boolean;
      continueCursor: string;
      rows: number;
      tags: { tag: string; count: number }[];
    } = await ctx.runQuery(internal.tagConsolidate.tagCountsPageInternal, {
      profileId: args.profileId,
      cursor,
    });
    result.scannedRows += page.rows;
    for (const { tag, count } of page.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + count);
    }
    if (page.isDone) break;
    if (result.scannedRows >= MAX_SCAN_ROWS) {
      result.truncated = true;
      break;
    }
    cursor = page.continueCursor;
  }

  const planned = planTagMerges(tagCounts.keys());
  const merges = [...planned];
  const ai = await resolveTagAi(ctx, args.userId);
  if (ai !== null) {
    const taken = new Set(planned.flatMap((m) => [m.keeper, ...m.losers]));
    const groups = planTagAiGroups(
      [...tagCounts].map(([tag, count]) => ({ tag, count })),
      taken,
    );
    const judged = await judgeTagGroups(ctx, {
      profileId: args.profileId,
      ai,
      groups,
    });
    result.aiCalls = judged.calls;
    result.aiGroupsMerged = judged.merges.length;
    merges.push(...judged.merges);
  }
  if (merges.length === 0) return { ...result, merges };

  cursor = null;
  for (;;) {
    const page: { isDone: boolean; continueCursor: string; retagged: number } =
      await ctx.runMutation(internal.tagConsolidate.retagPageInternal, {
        profileId: args.profileId,
        cursor,
        merges,
      });
    result.memoriesRetagged += page.retagged;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  result.groupsMerged = merges.length;
  result.tagsRemoved = merges.reduce((n, m) => n + m.losers.length, 0);
  if (args.runId !== undefined) {
    await ctx.runMutation(internal.tagConsolidate.recordTagMergeInternal, {
      runId: args.runId,
      groupsMerged: result.groupsMerged,
    });
  }
  return { ...result, merges };
}

// for the cleanup apply, which runs in a mutation and so schedules this
export const consolidateProfileTagsInternal = internalAction({
  args: {
    profileId: v.string(),
    runId: v.optional(v.id("dreamRuns")),
    userId: v.optional(v.id("users")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await consolidateProfileTags(ctx, args);
    return null;
  },
});
