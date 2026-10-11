import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { getUserByClerkId } from "./auth";
import { normalizeAccountEmail } from "./lib/accountEmail";
import { DEFAULT_PROFILE_COLOR } from "./profiles/helpers";
import { importPersonalSkills, SKILLS_IMPORT_MAX } from "./skills";
import { skillImportItemValidator } from "./validators";

// Owner-level (CLI / admin key) import of one user's vibot skills into their
// personal vmem skills, keyed by Clerk user id. Reuses the skills_import upsert
// (exact trimmed name, origin "vibot", idempotent). Run once per user with
// batches of at most 25 items:
//   npx convex run skillsAdminImport:importForClerkUser \
//     '{"clerkUserId":"user_x","items":[...],"dryRun":true}'
// Users without a vmem row are skipped: rows are normally created only when
// the user signs in (auth.ensureUserExists). createMissingUser opts in to
// creating the same row (plus the default Personal profile) for them.
export const importForClerkUser = internalMutation({
  args: {
    clerkUserId: v.string(),
    items: v.array(skillImportItemValidator),
    dryRun: v.boolean(),
    createMissingUser: v.optional(
      v.object({
        email: v.optional(v.string()),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        fullName: v.optional(v.string()),
      }),
    ),
  },
  returns: v.object({
    status: v.union(
      v.literal("imported"),
      v.literal("skipped_no_user"),
      v.literal("would_create_user"),
      v.literal("created_user"),
    ),
    dryRun: v.boolean(),
    created: v.number(),
    updated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.items.length > SKILLS_IMPORT_MAX) {
      throw new Error(
        `importForClerkUser accepts at most ${SKILLS_IMPORT_MAX} items`,
      );
    }
    const clerkUserId = args.clerkUserId.trim();
    if (clerkUserId.length === 0) {
      throw new Error("clerkUserId is required");
    }

    let user = await getUserByClerkId(ctx, clerkUserId);
    let status: "imported" | "would_create_user" | "created_user" = "imported";
    if (!user) {
      const profile = args.createMissingUser;
      if (profile === undefined) {
        return {
          status: "skipped_no_user" as const,
          dryRun: args.dryRun,
          created: 0,
          updated: 0,
          skipped: 0,
        };
      }
      if (args.dryRun) {
        // No row to read yet: every valid item would be created.
        const valid = args.items.filter(
          (item) =>
            item.name.trim().length > 0 &&
            item.description.trim().length > 0 &&
            item.instructions.trim().length > 0,
        ).length;
        return {
          status: "would_create_user" as const,
          dryRun: true,
          created: valid,
          updated: 0,
          skipped: args.items.length - valid,
        };
      }
      const userId = await ctx.db.insert("users", {
        clerkId: clerkUserId,
        email: normalizeAccountEmail(profile.email),
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
      });
      const now = Date.now();
      await ctx.db.insert("profiles", {
        userId,
        name: "Personal",
        color: DEFAULT_PROFILE_COLOR,
        icon: "user",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(userId);
      status = "created_user";
    }
    if (!user) {
      throw new Error("User not found");
    }

    const result = await importPersonalSkills(ctx, user._id, args.items, {
      dryRun: args.dryRun,
    });
    return {
      status,
      dryRun: args.dryRun,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    };
  },
});
