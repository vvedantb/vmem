import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  markdownToPlainText,
  mergeMarkdownForAppend,
  wikiExcerpt,
} from "../lib/wikiContent";
import {
  buildWikiChildrenByParent,
  findWikiChild,
  normalizeWikiPathSegments,
  wikiPathNodesFromDocs,
} from "../wiki/path";
import type { ActionCtx } from "../_generated/server";

export interface WikiListItem {
  id: string;
  title: string;
  kind: "folder" | "document";
  parentId: string | null;
  order: number;
  updatedAt: number;
}

export interface WikiGetResult {
  id: string;
  title: string;
  kind: "folder" | "document";
  parentId: string | null;
  contentMarkdown: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface WikiSearchItem {
  id: string;
  title: string;
  kind: "folder" | "document";
  excerpt: string;
}

function documentMarkdown(node: Doc<"wikiNodes">): string {
  return node.content ?? "";
}

function toListItem(node: Doc<"wikiNodes">): WikiListItem {
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    parentId: node.parentId ?? null,
    order: node.order,
    updatedAt: node.updatedAt,
  };
}

function toGetResult(node: Doc<"wikiNodes">): WikiGetResult {
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    parentId: node.parentId ?? null,
    contentMarkdown: node.kind === "document" ? documentMarkdown(node) : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

/** Walk `parentPath`, creating missing folder segments (e.g. `Learning/topic`). */
async function ensureWikiFolderPath(
  ctx: ActionCtx,
  clerkId: string,
  parentPath: string,
): Promise<Id<"wikiNodes">> {
  const segments = normalizeWikiPathSegments(parentPath);
  if (segments.length === 0) {
    throw new Error("parentPath must name at least one folder");
  }

  let nodes: Doc<"wikiNodes">[] = await ctx.runQuery(
    internal.wiki.listByClerkIdInternal,
    { clerkId },
  );
  let pathNodes = wikiPathNodesFromDocs(nodes);
  let byParent = buildWikiChildrenByParent(pathNodes);
  let currentParent: Id<"wikiNodes"> | undefined;

  for (const title of segments) {
    const existing = findWikiChild(byParent, currentParent ?? null, title);
    if (existing) {
      if (existing.kind !== "folder") {
        throw new Error(`Wiki path segment "${title}" is not a folder`);
      }
      currentParent = existing.id;
      continue;
    }

    const newId: Id<"wikiNodes"> = await ctx.runMutation(
      internal.wiki.createByClerkIdInternal,
      {
        clerkId,
        parentId: currentParent,
        kind: "folder",
        title,
      },
    );
    currentParent = newId;
    nodes = await ctx.runQuery(internal.wiki.listByClerkIdInternal, {
      clerkId,
    });
    pathNodes = wikiPathNodesFromDocs(nodes);
    byParent = buildWikiChildrenByParent(pathNodes);
  }

  if (!currentParent) {
    throw new Error("Failed to resolve parentPath");
  }
  return currentParent;
}

/** Reload a wiki node after a mutation and map it to the API result shape. */
async function reloadWikiNode(
  ctx: ActionCtx,
  clerkId: string,
  id: string,
  notFoundMessage: string,
): Promise<WikiGetResult> {
  const node: Doc<"wikiNodes"> | null = await ctx.runQuery(
    internal.wiki.getByIdInternal,
    { clerkId, id },
  );
  if (!node) {
    throw new Error(notFoundMessage);
  }
  return toGetResult(node);
}

function toSearchItem(node: Doc<"wikiNodes">): WikiSearchItem {
  const body = node.kind === "document" ? documentMarkdown(node) : "";
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    excerpt: wikiExcerpt(body.length > 0 ? body : node.title),
  };
}

export const mcpListWiki = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<WikiListItem[]> => {
    const rows: Doc<"wikiNodes">[] = await ctx.runQuery(
      internal.wiki.listByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    return rows.map(toListItem);
  },
});

export const mcpGetWiki = internalAction({
  args: { clerkId: v.string(), id: v.string() },
  handler: async (ctx, args): Promise<WikiGetResult | null> => {
    const node: Doc<"wikiNodes"> | null = await ctx.runQuery(
      internal.wiki.getByIdInternal,
      { clerkId: args.clerkId, id: args.id },
    );
    if (!node) return null;
    return toGetResult(node);
  },
});

export const mcpSearchWiki = internalAction({
  args: { clerkId: v.string(), query: v.string() },
  handler: async (ctx, args): Promise<WikiSearchItem[]> => {
    const rows: Doc<"wikiNodes">[] = await ctx.runQuery(
      internal.wiki.searchByClerkIdInternal,
      { clerkId: args.clerkId, queryText: args.query },
    );
    return rows.map(toSearchItem);
  },
});

export const mcpCreateWiki = internalAction({
  args: {
    clerkId: v.string(),
    kind: v.union(v.literal("folder"), v.literal("document")),
    title: v.string(),
    parentId: v.optional(v.string()),
    /** Slash path of ancestor folders; missing segments are created as folders. */
    parentPath: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    /** Link a folder to a synced codebase (validated owner-side). */
    sourceCodebaseId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WikiGetResult> => {
    const hasParentId = args.parentId !== undefined && args.parentId.length > 0;
    const parentPathTrimmed = args.parentPath?.trim() ?? "";
    const hasParentPath = parentPathTrimmed.length > 0;
    if (hasParentId && hasParentPath) {
      throw new Error("Provide parentId or parentPath, not both");
    }

    let parentId: Id<"wikiNodes"> | undefined;
    if (hasParentId && args.parentId !== undefined) {
      const parent: Doc<"wikiNodes"> | null = await ctx.runQuery(
        internal.wiki.getByIdInternal,
        { clerkId: args.clerkId, id: args.parentId },
      );
      if (!parent || parent.kind !== "folder") {
        throw new Error("Parent folder not found");
      }
      parentId = parent._id;
    } else if (hasParentPath) {
      parentId = await ensureWikiFolderPath(
        ctx,
        args.clerkId,
        parentPathTrimmed,
      );
    }

    const content =
      args.kind === "document" ? (args.contentMarkdown ?? "") : undefined;
    const contentText =
      content !== undefined ? markdownToPlainText(content) : undefined;

    const id: Id<"wikiNodes"> = await ctx.runMutation(
      internal.wiki.createByClerkIdInternal,
      {
        clerkId: args.clerkId,
        parentId,
        kind: args.kind,
        title: args.title,
        content,
        contentText,
        sourceCodebaseId: args.sourceCodebaseId,
      },
    );

    return reloadWikiNode(
      ctx,
      args.clerkId,
      id,
      "Failed to load created wiki node",
    );
  },
});

export const mcpUpdateWiki = internalAction({
  args: {
    clerkId: v.string(),
    id: v.string(),
    title: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    contentMode: v.optional(v.union(v.literal("replace"), v.literal("append"))),
  },
  handler: async (ctx, args): Promise<WikiGetResult> => {
    const existing: Doc<"wikiNodes"> | null = await ctx.runQuery(
      internal.wiki.getByIdInternal,
      { clerkId: args.clerkId, id: args.id },
    );
    if (!existing) {
      throw new Error("Not found");
    }

    let content: string | undefined;
    let contentText: string | undefined;

    if (args.contentMarkdown !== undefined) {
      if (existing.kind !== "document") {
        throw new Error("Cannot write content to a folder");
      }
      const mode = args.contentMode ?? "replace";
      const existingMarkdown = documentMarkdown(existing);
      content =
        mode === "append"
          ? mergeMarkdownForAppend(existingMarkdown, args.contentMarkdown)
          : args.contentMarkdown;
      contentText = markdownToPlainText(content);
    }

    await ctx.runMutation(internal.wiki.updateByClerkIdInternal, {
      clerkId: args.clerkId,
      id: args.id,
      title: args.title,
      content,
      contentText,
    });

    return reloadWikiNode(
      ctx,
      args.clerkId,
      args.id,
      "Failed to load updated wiki node",
    );
  },
});

export const mcpDeleteWiki = internalAction({
  args: { clerkId: v.string(), id: v.string() },
  handler: async (ctx, args): Promise<{ deletedCount: number }> => {
    const deletedCount: number = await ctx.runMutation(
      internal.wiki.deleteByClerkIdInternal,
      { clerkId: args.clerkId, id: args.id },
    );
    return { deletedCount };
  },
});
