import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { readOpenRouterApiKey } from "./lib/openRouterKey";
import { callJsonChatWithUsage } from "./lib/openRouter/jsonChat";
import { LLM_MODEL } from "./lib/openRouter/shared";
import { buildRollupPrompt, ROLLUP_ROLE } from "./prompts/rollup";
import { dayWindow } from "../engine/memory/rollupPeriod";
import {
  buildRollupBody,
  groupActivityByProfile,
  parseRollupReply,
  rollupStats,
  type ParsedRollup,
  type RollupActivity,
} from "../engine/memory/rollupPrompt";

// first try plus one retry, then the row is written as failed
const MAX_ATTEMPTS = 2;

export const rollupDayResultValidator = v.object({
  status: v.union(v.literal("idle"), v.literal("no_key"), v.literal("done")),
  ok: v.number(),
  failed: v.number(),
});

type RollupDayResult = Infer<typeof rollupDayResultValidator>;

// day rollup for one user: one jsonChat call per active profile, upserted
// into `rollups`. A quiet day makes no call and writes no row.
export async function runRollupDay(
  ctx: ActionCtx,
  args: { userId: Id<"users">; dayKey: string },
): Promise<RollupDayResult> {
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) return { status: "no_key", ok: 0, failed: 0 };
  const window = dayWindow(args.dayKey);
  const activity = await ctx.runQuery(
    internal.rollups.loadDayActivityInternal,
    { userId: args.userId, ...window },
  );
  if (!activity) return { status: "idle", ok: 0, failed: 0 };

  const groups = groupActivityByProfile(activity, activity.fallbackProfileId);
  const result: RollupDayResult = { status: "done", ok: 0, failed: 0 };
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
    window: { startMs: number; endMs: number };
    profile: { profileId: Id<"profiles">; teamId?: Id<"teams"> };
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
      prompt: buildRollupPrompt(body),
    });
    usage.inputTokens += reply.promptTokens ?? 0;
    usage.outputTokens += reply.completionTokens ?? 0;
    usage.costUsd += reply.costUsd ?? 0;
    parsed = reply.content ? parseRollupReply(reply.content, allowed) : null;
  }

  await ctx.runMutation(internal.rollups.upsertInternal, {
    userId: args.userId,
    profileId: args.profile.profileId,
    teamId: args.profile.teamId,
    period: "day",
    periodKey: args.dayKey,
    startMs: args.window.startMs,
    endMs: args.window.endMs,
    summary: parsed?.summary ?? "",
    highlights: parsed?.highlights ?? [],
    memoryIds: parsed?.memoryIds ?? [],
    stats,
    model: LLM_MODEL,
    ...usage,
    createdAt: Date.now(),
    status: parsed ? "ok" : "failed",
  });
  return parsed !== null;
}
