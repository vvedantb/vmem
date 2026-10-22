import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { readOpenRouterApiKey } from "./lib/openRouterKey";
import { callJsonChatWithUsage } from "./lib/openRouter/jsonChat";
import { LLM_MODEL } from "./lib/openRouter/shared";
import {
  buildPeriodRollupPrompt,
  buildRollupPrompt,
  ROLLUP_ROLE,
} from "./prompts/rollup";
import {
  dayWindow,
  summaryPeriodWindow,
  type PeriodWindow,
  type SummaryPeriod,
} from "@vmem/shared";
import {
  buildPeriodRollupBody,
  buildRollupBody,
  groupActivityByProfile,
  parseRollupReply,
  rollupStats,
  type ParsedRollup,
  type RollupActivity,
  type RollupSourceInput,
  type RollupStats,
} from "../engine/memory/rollupPrompt";

// first try plus one retry, then the row is written as failed
const MAX_ATTEMPTS = 2;

export const rollupResultValidator = v.object({
  status: v.union(v.literal("idle"), v.literal("no_key"), v.literal("done")),
  ok: v.number(),
  failed: v.number(),
});

type RollupResult = Infer<typeof rollupResultValidator>;

type RollupProfile = { profileId: Id<"profiles">; teamId?: Id<"teams"> };

// day rollup for one user: one jsonChat call per active profile, upserted
// into `rollups`. A quiet day makes no call and writes no row.
export async function runRollupDay(
  ctx: ActionCtx,
  args: { userId: Id<"users">; dayKey: string },
): Promise<RollupResult> {
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) return { status: "no_key", ok: 0, failed: 0 };
  const window = dayWindow(args.dayKey);
  const activity = await ctx.runQuery(
    internal.rollups.loadDayActivityInternal,
    { userId: args.userId, ...window },
  );
  if (!activity) return { status: "idle", ok: 0, failed: 0 };

  const groups = groupActivityByProfile(activity, activity.fallbackProfileId);
  const result: RollupResult = { status: "done", ok: 0, failed: 0 };
  for (const profile of activity.profiles) {
    const group = groups.get(profile.profileId);
    if (!group) continue;
    const ok = await rollupProfileDay(ctx, {
      apiKey,
      userId: args.userId,
      dayKey: args.dayKey,
      window,
      profile,
      group,
    });
    if (ok) result.ok += 1;
    else result.failed += 1;
  }
  return result;
}

async function rollupProfileDay(
  ctx: ActionCtx,
  args: {
    apiKey: string;
    userId: Id<"users">;
    dayKey: string;
    window: PeriodWindow;
    profile: RollupProfile;
    group: RollupActivity;
  },
): Promise<boolean> {
  const stats = rollupStats(args.group, args.window);
  const { body, memoryIds } = buildRollupBody({
    dayKey: args.dayKey,
    startMs: args.window.startMs,
    activity: args.group,
    stats,
  });
  const allowed = new Set(memoryIds);
  return await summariseAndUpsert(ctx, {
    ...args,
    period: "day",
    periodKey: args.dayKey,
    stats,
    prompt: buildRollupPrompt(body),
    parse: (raw) => parseRollupReply(raw, allowed),
  });
}

// week or month for one user, built only from stored ok rollup rows: one
// call per profile with sources. No sources makes no call and writes no row.
export async function runRollupPeriod(
  ctx: ActionCtx,
  args: { userId: Id<"users">; period: SummaryPeriod; periodKey: string },
): Promise<RollupResult> {
  const window = summaryPeriodWindow(args.period, args.periodKey);
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) return { status: "no_key", ok: 0, failed: 0 };
  const sources = await ctx.runQuery(
    internal.rollups.loadPeriodSourcesInternal,
    args,
  );
  if (sources.length === 0) return { status: "idle", ok: 0, failed: 0 };

  const byProfile = new Map<
    Id<"profiles">,
    { profile: RollupProfile; sources: RollupSourceInput[] }
  >();
  for (const source of sources) {
    const entry = byProfile.get(source.profileId) ?? {
      profile: { profileId: source.profileId, teamId: source.teamId },
      sources: [],
    };
    entry.sources.push(source);
    byProfile.set(source.profileId, entry);
  }

  const result: RollupResult = { status: "done", ok: 0, failed: 0 };
  for (const { profile, sources: group } of byProfile.values()) {
    const { body, memoryIds, stats } = buildPeriodRollupBody({
      period: args.period,
      periodKey: args.periodKey,
      sources: group,
    });
    const ok = await summariseAndUpsert(ctx, {
      apiKey,
      userId: args.userId,
      profile,
      period: args.period,
      periodKey: args.periodKey,
      window,
      stats,
      prompt: buildPeriodRollupPrompt(args.period, body),
      // the prompt shows no ids; the row cites what its sources cited
      parse: (raw) => {
        const parsed = parseRollupReply(raw, new Set());
        return parsed && { ...parsed, memoryIds };
      },
    });
    if (ok) result.ok += 1;
    else result.failed += 1;
  }
  return result;
}

// one jsonChat call (plus one retry), then an idempotent upsert: "ok" with
// the parsed reply, else an empty "failed" row
async function summariseAndUpsert(
  ctx: ActionCtx,
  args: {
    apiKey: string;
    userId: Id<"users">;
    profile: RollupProfile;
    period: "day" | SummaryPeriod;
    periodKey: string;
    window: PeriodWindow;
    stats: RollupStats;
    prompt: string;
    parse: (raw: string) => ParsedRollup | null;
  },
): Promise<boolean> {
  const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  let parsed: ParsedRollup | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !parsed; attempt++) {
    // feature "rollup" runs with thinking off (lib/openRouter/chat.ts)
    const reply = await callJsonChatWithUsage(ctx, {
      apiKey: args.apiKey,
      userId: args.userId,
      profileId: args.profile.profileId,
      feature: "rollup",
      model: LLM_MODEL,
      role: ROLLUP_ROLE,
      prompt: args.prompt,
    });
    usage.inputTokens += reply.promptTokens ?? 0;
    usage.outputTokens += reply.completionTokens ?? 0;
    usage.costUsd += reply.costUsd ?? 0;
    parsed = reply.content ? args.parse(reply.content) : null;
  }

  await ctx.runMutation(internal.rollups.upsertInternal, {
    userId: args.userId,
    profileId: args.profile.profileId,
    teamId: args.profile.teamId,
    period: args.period,
    periodKey: args.periodKey,
    startMs: args.window.startMs,
    endMs: args.window.endMs,
    summary: parsed?.summary ?? "",
    highlights: parsed?.highlights ?? [],
    memoryIds: parsed?.memoryIds ?? [],
    stats: args.stats,
    model: LLM_MODEL,
    ...usage,
    createdAt: Date.now(),
    status: parsed ? "ok" : "failed",
  });
  return parsed !== null;
}
