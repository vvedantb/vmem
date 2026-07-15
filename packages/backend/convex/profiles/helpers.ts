import type { Id, Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

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
