import { v } from "convex/values";
import { Crons } from "@convex-dev/crons";
import { components, internal } from "./_generated/api";
import { authMutation, authQuery } from "./auth";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Dream Mode V2 — user-wide schedule manager.
 *
 * One cron per user (named `dream-mode:user:<userId>`) fires
 * `runDreamForUserById` daily at the saved UTC HH:MM. The user-level
 * action then iterates every personal profile the user owns and runs a
 * synthesis pass on each, writing proposals (or auto-accepting memories
 * if `userSettings.dreamModeAutoAccept` is true).
 *
 * Schedule fields and the auto-accept flag live in `userSettings` —
 * Dream Mode is a system behavior, not a per-profile attribute. Team
 * profiles keep their own per-profile schedule (see
 * `setDreamScheduleForTeamProfile`).
 *
 * Hour/minute are stored AND scheduled in UTC; the UI converts the user's
 * local time before calling. This keeps the cron firing time stable
 * across DST transitions.
 */
export const dreamCrons = new Crons(components.crons);

function userCronName(userId: string): string {
  return `dream-mode:user:${userId}`;
}

function teamProfileCronName(profileId: string): string {
  return `dream-mode:${profileId}`;
}

/**
 * Set or clear the user's daily Dream Mode schedule. `enabled=false`
 * clears any registered cron and stores `dreamModeScheduleEnabled=false`.
 * `enabled=true` requires `hour` and `minute` (UTC) — re-registers the
 * cron and persists the saved time on `userSettings`.
 */
export const setDreamSchedule = authMutation({
  args: {
    enabled: v.boolean(),
    /** UTC hour 0-23. Required when enabled=true. */
    hour: v.optional(v.number()),
    /** UTC minute 0-59. Required when enabled=true. */
    minute: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
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

    const name = userCronName(ctx.userId);

    // Delete-then-register: cron component has no upsert primitive.
    const existing = await dreamCrons.get(ctx, { name });
    if (existing) {
      await dreamCrons.delete(ctx, { name });
    }

    // Persist on userSettings so the UI shows the saved value on refresh.
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    const patch = {
      dreamModeScheduleEnabled: args.enabled,
      dreamModeScheduleHour: args.enabled ? args.hour : undefined,
      dreamModeScheduleMinute: args.enabled ? args.minute : undefined,
    };
    if (settings) {
      await ctx.db.patch(settings._id, patch);
    } else {
      await ctx.db.insert("userSettings", { userId: ctx.userId, ...patch });
    }

    if (args.enabled && args.hour !== undefined && args.minute !== undefined) {
      // Cronspec: "minute hour day-of-month month day-of-week"
      const cronspec = `${String(args.minute)} ${String(args.hour)} * * *`;
      await dreamCrons.register(
        ctx,
        { kind: "cron", cronspec },
        internal.neo4jActions.dreamMode.runDreamForUserById,
        { userId: ctx.userId },
        name,
      );
    }

    await auditLog.log(ctx, {
      action: "user.dream_mode_schedule_updated",
      actorId: ctx.userId,
      resourceType: ResourceTypes.USER,
      resourceId: ctx.userId,
      metadata: {
        enabled: args.enabled,
        hour: args.hour ?? null,
        minute: args.minute ?? null,
      },
      severity: "info",
    });

    return null;
  },
});

/**
 * Per-team-profile schedule (kept from V1). Team profiles still use the
 * `dream-mode:<profileId>` cron and the per-profile fields on
 * `profileFields` because team membership cuts across users — a team
 * owner sets the schedule once for everyone on the team.
 */
export const setDreamScheduleForTeamProfile = authMutation({
  args: {
    profileId: v.id("profiles"),
    enabled: v.boolean(),
    hour: v.optional(v.number()),
    minute: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    if (!profile.teamId) {
      throw new Error(
        "Personal profiles use the user-wide Dream Mode schedule",
      );
    }

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

    const name = teamProfileCronName(args.profileId);
    const existing = await dreamCrons.get(ctx, { name });
    if (existing) {
      await dreamCrons.delete(ctx, { name });
    }

    await ctx.db.patch(args.profileId, {
      dreamModeScheduleEnabled: args.enabled,
      dreamModeScheduleHour: args.enabled ? args.hour : undefined,
      dreamModeScheduleMinute: args.enabled ? args.minute : undefined,
      updatedAt: Date.now(),
    });

    if (args.enabled && args.hour !== undefined && args.minute !== undefined) {
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
 * Used by the settings page to verify saved schedules are actually
 * active in the cron component (defense-in-depth against drift).
 */
export const listDreamCrons = authQuery({
  args: {},
  handler: async (ctx) => {
    const all = await dreamCrons.list(ctx);
    const dreamOnly = all.filter((c) => c.name?.startsWith("dream-mode:"));
    return dreamOnly.map((c) => ({
      name: c.name,
      schedule: c.schedule,
    }));
  },
});
