/**
 * Shared mechanics for the `profiles.ts` action surface.
 *
 * - Profile preset constants surfaced in the UI (color/icon pickers).
 * - `getOrCreateDefaultProfile` — used by the public mutation
 *   `getOrCreateDefault` and by the internal MCP path
 *   `getOrCreateDefaultByClerkIdInternal`. Returns the user's default
 *   profile, creating it on first call. Both callers are mutations,
 *   so the helper only accepts `MutationCtx`.
 */

import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const PROFILE_COLORS = [
  "#171717", // black (brand default)
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#6B7280", // gray
] as const;

export const PROFILE_ICONS = [
  "user",
  "briefcase",
  "home",
  "code",
  "book",
  "heart",
  "star",
  "rocket",
  "lightbulb",
  "music",
  "camera",
  "gamepad",
] as const;

export const DEFAULT_PROFILE_NAME = "Personal";
export const DEFAULT_PROFILE_COLOR = "#171717";
export const DEFAULT_PROFILE_ICON = "user";

export async function getOrCreateDefaultProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const existing = await ctx.db
    .query("profiles")
    .withIndex("by_user_default", (q) =>
      q.eq("userId", userId).eq("isDefault", true),
    )
    .first();
  if (existing) return existing;

  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    userId,
    name: DEFAULT_PROFILE_NAME,
    color: DEFAULT_PROFILE_COLOR,
    icon: DEFAULT_PROFILE_ICON,
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });

  const profile = await ctx.db.get(profileId);
  if (!profile) throw new Error("Failed to create default profile");
  return profile;
}
