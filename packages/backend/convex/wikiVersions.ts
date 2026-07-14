import { v } from "convex/values";
import { authQuery } from "./auth";
import { isContentReadable } from "./teams/auth";
import { resolveVersionAuthorLabel } from "./lib/versionSnapshot";

// read-only version history for wiki documents (snapshots written by `lib/versionSnapshot.ts`)

const sourceValidator = v.union(v.literal("web"), v.literal("mcp"));

// version list for a document — lightweight (no content), newest first
export const list = authQuery({
  args: { nodeId: v.id("wikiNodes") },
  returns: v.array(
    v.object({
      _id: v.id("wikiNodeVersions"),
      createdAt: v.number(),
      source: sourceValidator,
      authorLabel: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.nodeId);
    if (!node || !(await isContentReadable(ctx, node, ctx.userId))) return [];

    const versions = await ctx.db
      .query("wikiNodeVersions")
      .withIndex("by_node", (q) => q.eq("nodeId", args.nodeId))
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
  args: { versionId: v.id("wikiNodeVersions") },
  returns: v.union(
    v.object({
      _id: v.id("wikiNodeVersions"),
      nodeId: v.id("wikiNodes"),
      title: v.string(),
      content: v.string(),
      contentText: v.string(),
      createdAt: v.number(),
      source: sourceValidator,
      authorLabel: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) return null;
    const node = await ctx.db.get(version.nodeId);
    if (!node || !(await isContentReadable(ctx, node, ctx.userId))) return null;

    return {
      _id: version._id,
      nodeId: version.nodeId,
      title: version.title,
      content: version.content,
      contentText: version.contentText,
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
