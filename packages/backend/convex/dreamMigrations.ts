import { Crons } from "@convex-dev/crons";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// One-off clean-up after the per-user dream schedule and the event trigger
// were replaced by the nightly run (dreaming.ts). Run once after deploy:
//   npx convex run dreamMigrations:unregisterDreamCrons
//   npx convex run dreamMigrations:clearDreamScheduleFields '{"table":"userSettings"}'
//   npx convex run dreamMigrations:clearDreamScheduleFields '{"table":"profiles"}'
// Then a later PR can drop the deprecated fields, the crons component and
// this file.

const PAGE = 200;

// deletes every "dream-mode:*" job the old dreamSchedule.ts registered
export const unregisterDreamCrons = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const crons = new Crons(components.crons);
    const jobs = (await crons.list(ctx)).filter((job) =>
      job.name?.startsWith("dream-mode:"),
    );
    for (const job of jobs) await crons.delete(ctx, { id: job.id });
    return jobs.length;
  },
});

// clears the deprecated schedule fields, one page per mutation, then
// schedules the next page
export const clearDreamScheduleFields = internalMutation({
  args: {
    table: v.union(v.literal("userSettings"), v.literal("profiles")),
    cursor: v.optional(v.string()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query(args.table)
      .paginate({ numItems: PAGE, cursor: args.cursor ?? null });
    let cleared = 0;
    for (const doc of page.page) {
      if (
        doc.dreamModeScheduleEnabled === undefined &&
        doc.dreamModeScheduleTime === undefined
      ) {
        continue;
      }
      await ctx.db.patch(doc._id, {
        dreamModeScheduleEnabled: undefined,
        dreamModeScheduleTime: undefined,
      });
      cleared += 1;
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.dreamMigrations.clearDreamScheduleFields,
        { table: args.table, cursor: page.continueCursor },
      );
    }
    return cleared;
  },
});
