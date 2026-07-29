import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  markdownToPlainText,
  mergeMarkdownForAppend,
  wikiExcerpt,
} from "../lib/wikiContent";
import { wikiKindHasContent } from "@vmem/shared";
import { parentKey } from "../lib/scopedTree";
import {
  buildWikiChildrenByParent,
  findWikiChild,
  normalizeWikiPathSegments,
  wikiPathNodesFromDocs,
  type WikiPathNode,
} from "../wiki/path";

export type WikiListItem = {
  id: string;
  title: string;
  kind: "folder" | "document" | "artifact";
  parentId: string | null;
  order: number;
  updatedAt: number;
  language: string | null;
};

export type WikiGetResult = {
  id: string;
  title: string;
  kind: "folder" | "document" | "artifact";
  parentId: string | null;
  contentMarkdown: string | null;
  language: string | null;
  createdAt: number;
  updatedAt: number;
};

export type WikiSearchItem = {
  id: string;
  title: string;
  kind: "folder" | "document" | "artifact";
  excerpt: string;
};

function nodeBody(node: Doc<"wikiNodes">): string {
  return node.content ?? "";
}

export function toWikiListItem(node: Doc<"wikiNodes">): WikiListItem {
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    parentId: node.parentId ?? null,
    order: node.order,
    updatedAt: node.updatedAt,
    language: node.language ?? null,
  };
}

export function toWikiGetResult(node: Doc<"wikiNodes">): WikiGetResult {
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    parentId: node.parentId ?? null,
    contentMarkdown: wikiKindHasContent(node.kind) ? nodeBody(node) : null,
    language: node.language ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export function toWikiSearchItem(node: Doc<"wikiNodes">): WikiSearchItem {
  const body = wikiKindHasContent(node.kind) ? nodeBody(node) : "";
  return {
    id: node._id,
    title: node.title,
    kind: node.kind,
    excerpt: wikiExcerpt(body.length > 0 ? body : node.title),
  };
}

async function ensureWikiFolderPath(
  ctx: ActionCtx,
  clerkId: string,
  parentPath: string,
): Promise<Id<"wikiNodes">> {
  const segments = normalizeWikiPathSegments(parentPath);
  if (segments.length === 0) {
    throw new Error("parentPath must name at least one folder");
  }

  const nodes: Doc<"wikiNodes">[] = await ctx.runQuery(
    internal.wiki.listByClerkIdInternal,
    { clerkId },
  );
  const pathNodes = wikiPathNodesFromDocs(nodes);
  const byParent = buildWikiChildrenByParent(pathNodes);
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
    const newNode: WikiPathNode = {
      id: newId,
      parentId: currentParent ?? null,
      title,
      kind: "folder",
    };
    pathNodes.push(newNode);
    const parentLookupKey = parentKey(currentParent);
    const siblings = byParent.get(parentLookupKey) ?? [];
    siblings.push(newNode);
    byParent.set(parentLookupKey, siblings);
    currentParent = newId;
  }

  if (!currentParent) {
    throw new Error("Failed to resolve parentPath");
  }
  return currentParent;
}

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
  return toWikiGetResult(node);
}

export type CreateWikiArgs = {
  clerkId: string;
  kind: "folder" | "document" | "artifact";
  title: string;
  parentId?: string;
  parentPath?: string;
  contentMarkdown?: string;
  language?: string;
  sourceCodebaseId?: string;
};

export async function createWiki(
  ctx: ActionCtx,
  args: CreateWikiArgs,
): Promise<WikiGetResult> {
  const parentPathTrimmed = args.parentPath?.trim() ?? "";
  const hasParentPath = parentPathTrimmed.length > 0;
  const parentIdArg = args.parentId;
  if (parentIdArg !== undefined && parentIdArg.length > 0 && hasParentPath) {
    throw new Error("Provide parentId or parentPath, not both");
  }

  let parentId: Id<"wikiNodes"> | undefined;
  if (parentIdArg !== undefined && parentIdArg.length > 0) {
    const parent: Doc<"wikiNodes"> | null = await ctx.runQuery(
      internal.wiki.getByIdInternal,
      { clerkId: args.clerkId, id: parentIdArg },
    );
    if (!parent || parent.kind !== "folder") {
      throw new Error("Parent folder not found");
    }
    parentId = parent._id;
  } else if (hasParentPath) {
    parentId = await ensureWikiFolderPath(ctx, args.clerkId, parentPathTrimmed);
  }

  const hasContent = wikiKindHasContent(args.kind);
  const content = hasContent ? (args.contentMarkdown ?? "") : undefined;
  // documents, markdown to plain text for search. artifacts, mirror raw source
  const contentText =
    content === undefined
      ? undefined
      : args.kind === "artifact"
        ? content
        : markdownToPlainText(content);

  const id: Id<"wikiNodes"> = await ctx.runMutation(
    internal.wiki.createByClerkIdInternal,
    {
      clerkId: args.clerkId,
      parentId,
      kind: args.kind,
      title: args.title,
      content,
      contentText,
      language: args.language,
      sourceCodebaseId: args.sourceCodebaseId,
    },
  );

  return reloadWikiNode(
    ctx,
    args.clerkId,
    id,
    "Failed to load created wiki node",
  );
}

export type UpdateWikiArgs = {
  clerkId: string;
  id: string;
  title?: string;
  contentMarkdown?: string;
  contentMode?: "replace" | "append";
  language?: string;
};

export async function updateWiki(
  ctx: ActionCtx,
  args: UpdateWikiArgs,
): Promise<WikiGetResult> {
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
    if (!wikiKindHasContent(existing.kind)) {
      throw new Error("Cannot write content to a folder");
    }
    const mode = args.contentMode ?? "replace";
    const existingBody = nodeBody(existing);
    content =
      mode === "append"
        ? mergeMarkdownForAppend(existingBody, args.contentMarkdown)
        : args.contentMarkdown;
    contentText =
      existing.kind === "artifact" ? content : markdownToPlainText(content);
  }

  await ctx.runMutation(internal.wiki.updateByClerkIdInternal, {
    clerkId: args.clerkId,
    id: args.id,
    title: args.title,
    content,
    contentText,
    language: args.language,
  });

  return reloadWikiNode(
    ctx,
    args.clerkId,
    args.id,
    "Failed to load updated wiki node",
  );
}
