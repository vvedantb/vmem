import { v } from "convex/values";
import { Crons } from "@convex-dev/crons";
import { components, internal } from "./_generated/api";
import { authMutation, authQuery } from "./auth";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Dream Mode V2 — per-profile schedule manager.
 *
 * Each profile that has Dream Mode scheduling enabled gets its own
 * dynamically-registered cron via `@convex-dev/crons`. The cron name is
 * `dream-mode:<profileId>`, ensuring uniqueness per profile and an O(1)
 * lookup by name when toggling.
 *
 * The flow on `setDreamSchedule`:
 *   1. Validate caller owns the profile.
 *   2. Patch the profile's `dreamModeScheduleEnabled` / `Hour` / `Minute`
 *      fields so the UI stays in sync (and we can show the saved value
 *      after a refresh).
 *   3. Look up any existing cron by name — if present, delete it (we
 *      always re-register on save; cron component doesn't have an "update
 *      schedule" primitive, so delete-then-register is the canonical way).
 *   4. If `enabled` and a complete time was provided, register a new cron
 *      with cronspec `<minute> <hour> * * *` (daily at HH:MM UTC).
 *
 * Hour/minute are stored AND scheduled in UTC; the UI converts the user's
 * local time to UTC before calling this mutation. This avoids a server-
 * side timezone library and keeps cron firing time stable across DST
 * transitions (the user's perceived local time will shift by 1h on DST
 * boundaries — acceptable tradeoff for a daily synthesis pass).
 */
export const dreamCrons = new Crons(components.crons);

function cronNameFor(profileId: string): string {
  return `dream-mode:${profileId}`;
}

/**
 * Set or clear the Dream Mode daily schedule for a profile.
 *
 * `enabled=false` clears any registered cron and stores
 * `dreamModeScheduleEnabled=false`. `enabled=true` requires `hour` and
 * `minute` (UTC) — re-registers the cron and persists the saved time.
 */
export const setDreamSchedule = authMutation({
  args: {
    profileId: v.id("profiles"),
    enabled: v.boolean(),
    /** UTC hour 0-23. Required when enabled=true. */
    hour: v.optional(v.number()),
    /** UTC minute 0-59. Required when enabled=true. */
    minute: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");

    // Authorization: personal profile owner OR team owner. Same gating as
    // the auto-accept toggle so the two stay consistent.
    if (profile.teamId) {
      const teamId = profile.teamId;
      const membership = await ctx.db
        .query("teamMembers")
        .withIndex("by_team_user", (q) =>
          q.eq("teamId", teamId).eq("userId", ctx.userId),
        )
        .first();
      if (!membership || membership.role !== "owner") {
        throw new Error("Only team owners can configure Dream Mode");
      }
    } else if (profile.userId !== ctx.userId) {
      throw new Error("Profile not found");
    }

    if (
      args.enabled &&
      (args.hour === undefined ||
        args.minute === undefined ||
        args.hour < 0 ||
        args.hour > 23 ||
        args.minute < 0 ||
        args.minute > 59)
    ) {
      throw new Error("Pick a valid time (HH:MM)");
    }

    const name = cronNameFor(args.profileId);

    // Delete any existing cron for this profile. The component has no
    // "upsert" primitive, so the canonical pattern is delete-then-register.
    const existing = await dreamCrons.get(ctx, { name });
    if (existing) {
      await dreamCrons.delete(ctx, { name });
    }

    // Persist the schedule fields on the profile so the UI shows the saved
    // value on refresh (and the auto-accept toggle / time picker can read
    // the same source of truth).
    await ctx.db.patch(args.profileId, {
      dreamModeScheduleEnabled: args.enabled,
      dreamModeScheduleHour: args.enabled ? args.hour : undefined,
      dreamModeScheduleMinute: args.enabled ? args.minute : undefined,
      updatedAt: Date.now(),
    });

    if (args.enabled && args.hour !== undefined && args.minute !== undefined) {
      // Cronspec: "minute hour day-of-month month day-of-week"
      // Daily at HH:MM UTC → "<minute> <hour> * * *"
      const cronspec = `${String(args.minute)} ${String(args.hour)} * * *`;
      await dreamCrons.register(
        ctx,
        { kind: "cron", cronspec },
        internal.neo4jActions.dreamMode.runDreamForProfileById,
        { profileId: args.profileId },
        name,
      );
    }

    await auditLog.log(ctx, {
      action: "profile.dream_mode_schedule_updated",
      actorId: ctx.userId,
      resourceType: ResourceTypes.PROFILE,
      resourceId: args.profileId,
      metadata: {
        enabled: args.enabled,
        hour: args.hour ?? null,
        minute: args.minute ?? null,
      },
      severity: "info",
    });

    return await ctx.db.get(args.profileId);
  },
});

/**
 * Read-only view of registered Dream Mode crons for the current user.
 * Used by the settings page to verify that a saved schedule is actually
 * active in the cron component (defense-in-depth against drift between
 * profile fields and component state).
 */
export const listDreamCrons = authQuery({
  args: {},
  handler: async (ctx) => {
    const all = await dreamCrons.list(ctx);
    // Filter to dream-mode crons only — other components may register crons
    // under different name prefixes in the future.
    const dreamOnly = all.filter((c) => c.name?.startsWith("dream-mode:"));
    return dreamOnly.map((c) => ({
      name: c.name,
      schedule: c.schedule,
    }));
  },
});
