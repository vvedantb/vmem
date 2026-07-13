import { v } from "convex/values";
import { Crons } from "@convex-dev/crons";
import type { FunctionArgs, SchedulableFunctionReference } from "convex/server";
import { parseHHMM } from "@vmem/shared";
import { components, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { authMutation, authQuery } from "./auth";
import { auditLog, ResourceTypes } from "./auditLog";

/**
 * Dream Mode V2 — user-wide schedule manager.
 *
 * One cron per user (named `dream-mode:user:<userId>`) fires
 * `runDreamForUserById` daily at the saved UTC time. The user-level action
 * then iterates every personal profile the user owns and runs a synthesis
 * pass on each, writing proposals (or auto-accepting memories if
 * `userSettings.dreamModeAutoAccept` is true).
 *
 * Schedule fields and the auto-accept flag live in `userSettings` —
 * Dream Mode is a system behavior, not a per-profile attribute. Team
 * profiles keep their own per-profile schedule (see
 * `setDreamScheduleForTeamProfile`).
 *
 * Time is stored as "HH:MM" UTC — the same shape `<input type="time">`
 * produces, so the UI never has to split it. The browser converts the
 * user's local time to UTC before saving so the cron fires at a stable
 * moment regardless of DST.
 */
export const dreamCrons = new Crons(components.crons);

function userCronName(userId: string): string {
  return `dream-mode:user:${userId}`;
}

function teamProfileCronName(profileId: string): string {
  return `dream-mode:${profileId}`;
}

/** Build a daily cronspec ("M H * * *") from "HH:MM". */
function cronspecForTime(hour: number, minute: number): string {
  return `${String(minute)} ${String(hour)} * * *`;
}

/**
 * Parse+validate an enable/time pair, throwing the shared user-facing
 * error on malformed input. Returns null when the schedule should be
 * disabled (parsed is only non-null when `enabled` is true).
 */
function requireParsedSchedule(
  enabled: boolean,
  time: string | undefined,
): { hour: number; minute: number } | null {
  const parsed = enabled && time !== undefined ? parseHHMM(time) : null;
  if (enabled && parsed === null) {
    throw new Error("Pick a valid time (HH:MM)");
  }
  return parsed;
}

/**
 * Delete-then-register a named daily cron (the cron component has no
 * upsert primitive). `parsed === null` means "leave it deleted".
 */
async function replaceDailyCron<F extends SchedulableFunctionReference>(
  ctx: MutationCtx,
  name: string,
  parsed: { hour: number; minute: number } | null,
  func: F,
  args: FunctionArgs<F>,
): Promise<void> {
  const existing = await dreamCrons.get(ctx, { name });
  if (existing) {
    await dreamCrons.delete(ctx, { name });
  }
  if (parsed !== null) {
    await dreamCrons.register(
      ctx,
      { kind: "cron", cronspec: cronspecForTime(parsed.hour, parsed.minute) },
      func,
      args,
      name,
    );
  }
}

/**
 * Set or clear the user's daily Dream Mode schedule. `enabled=false`
 * clears any registered cron and stores `dreamModeScheduleEnabled=false`.
 * `enabled=true` requires a `time` ("HH:MM" UTC) — re-registers the cron
 * and persists the saved time on `userSettings`.
 */
export const setDreamSchedule = authMutation({
  args: {
    enabled: v.boolean(),
    /** "HH:MM" in UTC. Required when enabled=true. */
    time: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parsed = requireParsedSchedule(args.enabled, args.time);
    const name = userCronName(ctx.userId);

    // Persist on userSettings so the UI shows the saved value on refresh.
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    const patch = {
      dreamModeScheduleEnabled: args.enabled,
      dreamModeScheduleTime: args.enabled ? args.time : undefined,
    };
    if (settings) {
      await ctx.db.patch(settings._id, patch);
    } else {
      await ctx.db.insert("userSettings", { userId: ctx.userId, ...patch });
    }

    await replaceDailyCron(
      ctx,
      name,
      parsed,
      internal.neo4jActions.dreamMode.runDreamForUserById,
      { userId: ctx.userId },
    );

    await auditLog.log(ctx, {
      action: "user.dream_mode_schedule_updated",
      actorId: ctx.userId,
      resourceType: ResourceTypes.USER,
      resourceId: ctx.userId,
      metadata: {
        enabled: args.enabled,
        time: args.time ?? null,
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
    /** "HH:MM" in UTC. Required when enabled=true. */
    time: v.optional(v.string()),
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

    const parsed = requireParsedSchedule(args.enabled, args.time);
    const name = teamProfileCronName(args.profileId);

    await ctx.db.patch(args.profileId, {
      dreamModeScheduleEnabled: args.enabled,
      dreamModeScheduleTime: args.enabled ? args.time : undefined,
      updatedAt: Date.now(),
    });

    await replaceDailyCron(
      ctx,
      name,
      parsed,
      internal.neo4jActions.dreamMode.runDreamForProfileById,
      { profileId: args.profileId },
    );

    await auditLog.log(ctx, {
      action: "profile.dream_mode_schedule_updated",
      actorId: ctx.userId,
      resourceType: ResourceTypes.PROFILE,
      resourceId: args.profileId,
      metadata: {
        enabled: args.enabled,
        time: args.time ?? null,
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
