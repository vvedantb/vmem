"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  markdownToWikiStorage,
  mergeMarkdownForAppend,
  wikiExcerpt,
  wikiStorageToMarkdown,
} from "../src/wiki/wikiMarkdown";

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
    contentMarkdown:
      node.kind === "document"
        ? wikiStorageToMarkdown(node.contentJson, node.contentText)
        : null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

function toSearchItem(node: Doc<"wikiNodes">): WikiSearchItem {
  const body =
    node.kind === "document"
      ? wikiStorageToMarkdown(node.contentJson, node.contentText)
      : "";
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
    contentMarkdown: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<WikiGetResult> => {
    let parentId: Id<"wikiNodes"> | undefined;
    if (args.parentId !== undefined && args.parentId.length > 0) {
      const parent: Doc<"wikiNodes"> | null = await ctx.runQuery(
        internal.wiki.getByIdInternal,
        { clerkId: args.clerkId, id: args.parentId },
      );
      if (!parent || parent.kind !== "folder") {
        throw new Error("Parent folder not found");
      }
      parentId = parent._id;
    }

    let contentJson: string | undefined;
    let contentText: string | undefined;
    if (args.kind === "document" && args.contentMarkdown !== undefined) {
      const stored = markdownToWikiStorage(args.contentMarkdown);
      contentJson = stored.contentJson;
      contentText = stored.contentText;
    }

    const id: Id<"wikiNodes"> = await ctx.runMutation(
      internal.wiki.createByClerkIdInternal,
      {
        clerkId: args.clerkId,
        parentId,
        kind: args.kind,
        title: args.title,
        contentJson,
        contentText,
      },
    );

    const node: Doc<"wikiNodes"> | null = await ctx.runQuery(
      internal.wiki.getByIdInternal,
      { clerkId: args.clerkId, id },
    );
    if (!node) {
      throw new Error("Failed to load created wiki node");
    }
    return toGetResult(node);
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

    let contentJson: string | undefined;
    let contentText: string | undefined;

    if (args.contentMarkdown !== undefined) {
      if (existing.kind !== "document") {
        throw new Error("Cannot write content to a folder");
      }
      const mode = args.contentMode ?? "replace";
      const existingMarkdown = wikiStorageToMarkdown(
        existing.contentJson,
        existing.contentText,
      );
      const merged =
        mode === "append"
          ? mergeMarkdownForAppend(existingMarkdown, args.contentMarkdown)
          : args.contentMarkdown;
      const stored = markdownToWikiStorage(merged);
      contentJson = stored.contentJson;
      contentText = stored.contentText;
    }

    await ctx.runMutation(internal.wiki.updateByClerkIdInternal, {
      clerkId: args.clerkId,
      id: args.id,
      title: args.title,
      contentJson,
      contentText,
    });

    const node: Doc<"wikiNodes"> | null = await ctx.runQuery(
      internal.wiki.getByIdInternal,
      { clerkId: args.clerkId, id: args.id },
    );
    if (!node) {
      throw new Error("Failed to load updated wiki node");
    }
    return toGetResult(node);
  },
});
