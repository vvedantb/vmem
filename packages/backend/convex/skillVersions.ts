import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authQuery } from "./auth";
import { isContentReadable } from "./teams/auth";
import {
  resolveVersionAuthorLabel,
  mapVersionAuthorSummaries,
} from "./lib/versionSnapshot";

const sourceValidator = v.union(v.literal("web"), v.literal("mcp"));

// Version list for a skill the viewer can read (owner or team member), else
// empty. Shared by the web history panel and the MCP skills_history tool.
export async function listSkillVersionsForViewer(
  ctx: QueryCtx,
  viewerUserId: Id<"users">,
  skillId: Id<"skills">,
) {
  const skill = await ctx.db.get(skillId);
  if (!skill || !(await isContentReadable(ctx, skill, viewerUserId))) {
    return [];
  }

  const versions = await ctx.db
    .query("skillVersions")
    .withIndex("by_skill", (q) => q.eq("skillId", skillId))
    .order("desc")
    .collect();

  return await mapVersionAuthorSummaries(ctx, viewerUserId, versions);
}

// One version of a skill the viewer can read, else null.
export async function getSkillVersionForViewer(
  ctx: QueryCtx,
  viewerUserId: Id<"users">,
  versionId: Id<"skillVersions">,
) {
  const version = await ctx.db.get(versionId);
  if (!version) return null;
  const skill = await ctx.db.get(version.skillId);
  if (!skill || !(await isContentReadable(ctx, skill, viewerUserId))) {
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
      viewerUserId,
      version.authorUserId,
      version.source,
    ),
  };
}

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
  handler: async (ctx, args) =>
    listSkillVersionsForViewer(ctx, ctx.userId, args.skillId),
});

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
  handler: async (ctx, args) =>
    getSkillVersionForViewer(ctx, ctx.userId, args.versionId),
});
