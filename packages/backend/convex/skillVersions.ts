import { v } from "convex/values";
import { authQuery } from "./auth";
import { isContentReadable } from "./teams/auth";
import { resolveVersionAuthorLabel } from "./lib/versionSnapshot";

// read-only version history for skills (snapshots written by `lib/versionSnapshot.ts`)

const sourceValidator = v.union(v.literal("web"), v.literal("mcp"));

// version list for a skill — lightweight (no body), newest first
export const list = authQuery({
  args: { skillId: v.id("skills") },
  returns: v.array(
    v.object({
      _id: v.id("skillVersions"),
      createdAt: v.number(),
      source: sourceValidator,
      authorLabel: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill || !(await isContentReadable(ctx, skill, ctx.userId))) return [];

    const versions = await ctx.db
      .query("skillVersions")
      .withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
      .order("desc")
      .collect();

    return await Promise.all(
      versions.map(async (ver) => ({
        _id: ver._id,
        createdAt: ver.createdAt,
        source: ver.source,
        authorLabel: await resolveVersionAuthorLabel(
          ctx,
          ctx.userId,
          ver.authorUserId,
          ver.source,
        ),
      })),
    );
  },
});

// full version by id, for the read-only preview pane
export const get = authQuery({
  args: { versionId: v.id("skillVersions") },
  returns: v.union(
    v.object({
      _id: v.id("skillVersions"),
      skillId: v.id("skills"),
      name: v.string(),
      description: v.string(),
      instructions: v.string(),
      enabled: v.optional(v.boolean()),
      createdAt: v.number(),
      source: sourceValidator,
      authorLabel: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;
    const skill = await ctx.db.get(version.skillId);
    if (!skill || !(await isContentReadable(ctx, skill, ctx.userId))) {
      return null;
    }

    return {
      _id: version._id,
      skillId: version.skillId,
      name: version.name,
      description: version.description,
      instructions: version.instructions,
      enabled: version.enabled,
      createdAt: version.createdAt,
      source: version.source,
      authorLabel: await resolveVersionAuthorLabel(
        ctx,
        ctx.userId,
        version.authorUserId,
        version.source,
      ),
    };
  },
});
