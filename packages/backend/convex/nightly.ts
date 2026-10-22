import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { nightlyPool } from "./workpools";
import { runRollupDay, runRollupPeriod } from "./rollupActions";
import { periodsClosingAfter, yesterdayDayKey } from "@vmem/shared";

// shared 02:30 utc run (crons.ts): kick pages users, runUser does each one
const USER_PAGE = 50;

// global kill switch for the cron path; manual runs still work
function nightlyDisabled(): boolean {
  return process.env.NIGHTLY_DISABLED === "1";
}

export const kick = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    // fixed on the first page so a run that crosses midnight stays on one day
    dayKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (nightlyDisabled()) return null;
    const dayKey = args.dayKey ?? yesterdayDayKey(Date.now());
    const page = await ctx.db
      .query("users")
      .paginate({ numItems: USER_PAGE, cursor: args.cursor ?? null });
    if (page.page.length > 0) {
      await nightlyPool.enqueueActionBatch(
        ctx,
        internal.nightly.runUser,
        page.page.map((user) => ({ userId: user._id, dayKey })),
      );
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.nightly.kick, {
        cursor: page.continueCursor,
        dayKey,
      });
    }
    return null;
  },
});

// DREAMING PR: fill in. Placeholder for the nightly dream step (item 4 §3c).
// It runs before the rollup so the day summary reads cleaned data, and gets
// its own opt-in. Leave dreamTrigger / dreamSchedule alone until then.
async function runDreamStep(): Promise<void> {}

// steps in order: dream, then the day rollup if the user opted in, then the
// week (day was a Sunday) and month (day was the last) built from stored
// rows. A failed dream step is logged and does not block the rollup.
export const runUser = internalAction({
  args: { userId: v.id("users"), dayKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (nightlyDisabled()) return null;
    try {
      await runDreamStep();
    } catch (err) {
      console.error("[nightly][dream]", args.userId, err);
    }
    const rollupsEnabled = await ctx.runQuery(
      internal.userSettings.getRollupsEnabledInternal,
      { userId: args.userId },
    );
    if (!rollupsEnabled) return null;
    await runRollupDay(ctx, args);
    for (const closing of periodsClosingAfter(args.dayKey)) {
      await runRollupPeriod(ctx, { userId: args.userId, ...closing });
    }
    return null;
  },
});
