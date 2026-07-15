import { v } from "convex/values";
import { authMutation, authQuery } from "./auth";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { wikiNodeFields } from "./validators";
import {
  assertContentDeletable,
  assertContentEditable,
  isContentReadable,
  requireContentScopeAccess,
} from "./teams/auth";
import { getUserIdByClerkId } from "./lib/clerkUser";
import { collectSubtreeIds } from "./lib/scopedTree";
import {
  deleteVersionsForWikiNode,
  maybeSnapshotWikiVersion,
} from "./lib/versionSnapshot";
import { wikiKindHasContent } from "./lib/wikiKind";

const wikiKindValidator = v.union(
  v.literal("folder"),
  v.literal("document"),
  v.literal("artifact"),
);

const MAX_SEARCH_RESULTS = 20;

// every node in a scope: a team's wiki, or the user's personal nodes
async function listScopeNodes(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<Array<Doc<"wikiNodes">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("wikiNodes")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  }
  const nodes = await ctx.db
    .query("wikiNodes")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return nodes.filter((n) => n.teamId === undefined);
}

// siblings under one parent within a scope (for order assignment)
async function listScopeSiblings(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  parentId: Id<"wikiNodes"> | undefined,
): Promise<Array<Doc<"wikiNodes">>> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("wikiNodes")
      .withIndex("by_team_parent", (q) =>
        q.eq("teamId", teamId).eq("parentId", parentId),
      )
      .collect();
  }
  const siblings = await ctx.db
    .query("wikiNodes")
    .withIndex("by_user_parent", (q) =>
      q.eq("userId", userId).eq("parentId", parentId),
    )
    .collect();
  return siblings.filter((n) => n.teamId === undefined);
}

// `order = max(sibling.order) + 1`, or 0 when the parent has no children
function nextSiblingOrder(siblings: Array<Doc<"wikiNodes">>): number {
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((s) => s.order)) + 1;
}

// parent must exist, be a folder, and live in the same scope
async function assertWikiParentFolder(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"wikiNodes"> | undefined,
  scope: { userId: Id<"users">; teamId: Id<"teams"> | undefined },
): Promise<void> {
  if (parentId === undefined) return;
  const parent = await ctx.db.get(parentId);
  if (
    !parent ||
    parent.teamId !== scope.teamId ||
    (scope.teamId === undefined && parent.userId !== scope.userId)
  ) {
    throw new Error("Parent not found");
  }
  if (parent.kind !== "folder") {
    throw new Error("Parent must be a folder");
  }
}

// dedupe title + content hits, documents first in input order, capped
function mergeWikiSearchHits(
  titleMatches: Array<Doc<"wikiNodes">>,
  contentMatches: Array<Doc<"wikiNodes">>,
): Array<Doc<"wikiNodes">> {
  const seen = new Set<string>();
  const merged: Array<Doc<"wikiNodes">> = [];
  for (const node of [...titleMatches, ...contentMatches]) {
    if (seen.has(node._id)) continue;
    seen.add(node._id);
    merged.push(node);
    if (merged.length >= MAX_SEARCH_RESULTS) break;
  }
  return merged;
}

type CreateWikiNodeFields = {
  userId: Id<"users">;
  teamId?: Id<"teams">;
  parentId?: Id<"wikiNodes">;
  kind: Doc<"wikiNodes">["kind"];
  title: string;
  content?: string;
  contentText?: string;
  language?: string;
  sourceCodebaseId?: Id<"codebases">;
};

async function createWikiNodeRecord(
  ctx: MutationCtx,
  fields: CreateWikiNodeFields,
): Promise<Id<"wikiNodes">> {
  const siblings = await listScopeSiblings(
    ctx,
    fields.userId,
    fields.teamId,
    fields.parentId,
  );
  const now = Date.now();
  const hasContent = wikiKindHasContent(fields.kind);
  return await ctx.db.insert("wikiNodes", {
    userId: fields.userId,
    teamId: fields.teamId,
    parentId: fields.parentId,
    kind: fields.kind,
    title: fields.title,
    content: hasContent ? (fields.content ?? "") : undefined,
    contentText: hasContent ? (fields.contentText ?? "") : undefined,
    language:
      fields.kind === "artifact" ? (fields.language ?? "html") : undefined,
    order: nextSiblingOrder(siblings),
    sourceCodebaseId: fields.sourceCodebaseId,
    createdAt: now,
    updatedAt: now,
  });
}

async function searchWikiInScope(
  ctx: QueryCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  trimmedQuery: string,
): Promise<Array<Doc<"wikiNodes">>> {
  const titleMatches = await ctx.db
    .query("wikiNodes")
    .withSearchIndex("search_title", (q) =>
      teamId !== undefined
        ? q.search("title", trimmedQuery).eq("teamId", teamId)
        : q
            .search("title", trimmedQuery)
            .eq("userId", userId)
            .eq("teamId", undefined),
    )
    .take(MAX_SEARCH_RESULTS);

  const contentMatches = await ctx.db
    .query("wikiNodes")
    .withSearchIndex("search_content", (q) =>
      teamId !== undefined
        ? q.search("contentText", trimmedQuery).eq("teamId", teamId)
        : q
            .search("contentText", trimmedQuery)
            .eq("userId", userId)
            .eq("teamId", undefined),
    )
    .take(MAX_SEARCH_RESULTS);

  return mergeWikiSearchHits(titleMatches, contentMatches);
}

type WikiNodePatch = {
  title?: string;
  content?: string;
  contentText?: string;
  language?: string;
};

async function applyWikiNodeUpdate(
  ctx: MutationCtx,
  node: Doc<"wikiNodes">,
  patch: WikiNodePatch,
  meta: {
    source: "web" | "mcp";
    authorUserId: Id<"users">;
    force?: boolean;
  },
): Promise<void> {
  await maybeSnapshotWikiVersion(ctx, node, meta);
  await ctx.db.patch(node._id, { ...patch, updatedAt: Date.now() });
}

// returns all wikiNodes in the requested scope, sorted by `order` ascending
export const listTree = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const nodes = await listScopeNodes(ctx, ctx.userId, args.teamId);
    return nodes.sort((a, b) => a.order - b.order);
  },
});

// internal variant of `listTree` that takes an explicit userId instead of deriving it from auth
export const listForUserInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("wikiNodes"),
      _creationTime: v.number(),
      ...wikiNodeFields,
    }),
  ),
  handler: async (ctx, args) => {
    return await listScopeNodes(ctx, args.userId, undefined);
  },
});

// workspace-scoped wiki nodes for the memory graph (personal or team)
export const listForGraphInternal = internalQuery({
  args: {
    userId: v.id("users"),
    teamId: v.optional(v.id("teams")),
  },
  returns: v.array(
    v.object({
      _id: v.id("wikiNodes"),
      _creationTime: v.number(),
      ...wikiNodeFields,
    }),
  ),
  handler: async (ctx, args) => {
    return await listScopeNodes(ctx, args.userId, args.teamId);
  },
});

// fetch a single node by id
export const getNode = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalized = ctx.db.normalizeId("wikiNodes", args.id);
    if (!normalized) return null;
    const node = await ctx.db.get(normalized);
    if (!node) return null;
    if (!(await isContentReadable(ctx, node, ctx.userId))) return null;
    return node;
  },
});

// create a new folder or document under `parentId` (or at root when undefined), in
export const createNode = authMutation({
  args: {
    parentId: v.optional(v.id("wikiNodes")),
    kind: wikiKindValidator,
    title: v.string(),
    teamId: v.optional(v.id("teams")),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    await assertWikiParentFolder(ctx, args.parentId, {
      userId: ctx.userId,
      teamId: args.teamId,
    });

    return await createWikiNodeRecord(ctx, {
      userId: ctx.userId,
      teamId: args.teamId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title,
      language: args.language,
    });
  },
});

// rename a folder or document (any team member for team nodes)
export const renameNode = authMutation({
  args: { id: v.id("wikiNodes"), title: v.string() },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    await applyWikiNodeUpdate(
      ctx,
      node,
      { title: args.title },
      {
        source: "web",
        authorUserId: ctx.userId,
      },
    );
  },
});

// persist editor content
export const updateContent = authMutation({
  args: {
    id: v.id("wikiNodes"),
    content: v.string(),
    contentText: v.string(),
    // restore path: force a pre-overwrite snapshot regardless of the burst boundary
    forceSnapshot: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    if (!wikiKindHasContent(node.kind)) {
      throw new Error("Cannot write content to a folder");
    }
    await applyWikiNodeUpdate(
      ctx,
      node,
      { content: args.content, contentText: args.contentText },
      {
        source: "web",
        authorUserId: ctx.userId,
        force: args.forceSnapshot,
      },
    );
  },
});

// recursively delete a node and every descendant
async function deleteWikiSubtree(
  ctx: MutationCtx,
  actorUserId: Id<"users">,
  rootId: Id<"wikiNodes">,
): Promise<number> {
  const root = await ctx.db.get(rootId);
  if (!root) throw new Error("Not found");
  await assertContentDeletable(ctx, root, actorUserId);

  const allNodes = await listScopeNodes(ctx, root.userId, root.teamId);
  const toDelete = collectSubtreeIds(allNodes, root._id);

  for (const id of toDelete) {
    await deleteVersionsForWikiNode(ctx, id);
    await ctx.db.delete(id);
  }

  return toDelete.length;
}

export const deleteNode = authMutation({
  args: { id: v.id("wikiNodes") },
  handler: async (ctx, args) => {
    await deleteWikiSubtree(ctx, ctx.userId, args.id);
  },
});

// bulk-delete several nodes, each recursively (with its version snapshots)
export const deleteNodes = authMutation({
  args: { ids: v.array(v.id("wikiNodes")) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const node = await ctx.db.get(id);
      if (!node) continue; // already deleted within an ancestor's subtree
      await deleteWikiSubtree(ctx, ctx.userId, id);
    }
  },
});

// move a node to a new parent and/or reorder within its siblings
export const moveNode = authMutation({
  args: {
    id: v.id("wikiNodes"),
    newParentId: v.optional(v.id("wikiNodes")),
    newOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const node = await ctx.db.get(args.id);
    if (!node) throw new Error("Not found");
    await assertContentEditable(ctx, node, ctx.userId);
    if (args.newParentId !== undefined) {
      await assertWikiParentFolder(ctx, args.newParentId, {
        userId: node.userId,
        teamId: node.teamId,
      });
      // guard against cycles: parent cannot be a descendant of node
      let cursor: Doc<"wikiNodes"> | null = await ctx.db.get(args.newParentId);
      while (cursor !== null) {
        if (cursor._id === node._id) {
          throw new Error("Cannot move a node into its own descendant");
        }
        cursor = cursor.parentId ? await ctx.db.get(cursor.parentId) : null;
      }
    }

    await ctx.db.patch(args.id, {
      parentId: args.newParentId,
      order: args.newOrder,
      updatedAt: Date.now(),
    });
  },
});

// union search across title + content full-text indexes, within one scope (personal
export const search = authQuery({
  args: { queryText: v.string(), teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const trimmed = args.queryText.trim();
    if (trimmed.length === 0) return [];
    return await searchWikiInScope(ctx, ctx.userId, args.teamId, trimmed);
  },
});

async function getOwnedNode(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  id: string,
): Promise<Doc<"wikiNodes"> | null> {
  const normalized = ctx.db.normalizeId("wikiNodes", id);
  if (!normalized) return null;
  const node = await ctx.db.get(normalized);
  if (!node || node.userId !== userId || node.teamId !== undefined) {
    return null;
  }
  return node;
}

export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const nodes = await listScopeNodes(ctx, userId, undefined);
    return nodes.sort((a, b) => a.order - b.order);
  },
});

export const getByIdInternal = internalQuery({
  args: { clerkId: v.string(), id: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    return await getOwnedNode(ctx, userId, args.id);
  },
});

export const searchByClerkIdInternal = internalQuery({
  args: { clerkId: v.string(), queryText: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const trimmed = args.queryText.trim();
    if (trimmed.length === 0) return [];
    return await searchWikiInScope(ctx, userId, undefined, trimmed);
  },
});

export const createByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    parentId: v.optional(v.id("wikiNodes")),
    kind: wikiKindValidator,
    title: v.string(),
    content: v.optional(v.string()),
    contentText: v.optional(v.string()),
    language: v.optional(v.string()),
    // plain-string codebase id (MCP threads ids as strings); validated below
    sourceCodebaseId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    await assertWikiParentFolder(ctx, args.parentId, {
      userId,
      teamId: undefined,
    });

    // validate the optional codebase link belongs to this user
    let sourceCodebaseId: Id<"codebases"> | undefined;
    if (
      args.sourceCodebaseId !== undefined &&
      args.sourceCodebaseId.length > 0
    ) {
      const cbId = ctx.db.normalizeId("codebases", args.sourceCodebaseId);
      if (!cbId) throw new Error("Invalid codebase id");
      const cb = await ctx.db.get(cbId);
      if (!cb || cb.userId !== userId) throw new Error("Codebase not found");
      sourceCodebaseId = cbId;
    }

    return await createWikiNodeRecord(ctx, {
      userId,
      parentId: args.parentId,
      kind: args.kind,
      title: args.title,
      content: args.content,
      contentText: args.contentText,
      language: args.language,
      sourceCodebaseId,
    });
  },
});

export const updateByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    id: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    contentText: v.optional(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await getOwnedNode(ctx, userId, args.id);
    if (!node) {
      throw new Error("Not found");
    }

    const patch: WikiNodePatch = {};

    if (args.title !== undefined) {
      patch.title = args.title;
    }

    if (args.content !== undefined || args.contentText !== undefined) {
      if (!wikiKindHasContent(node.kind)) {
        throw new Error("Cannot write content to a folder");
      }
      if (args.content !== undefined) {
        patch.content = args.content;
      }
      if (args.contentText !== undefined) {
        patch.contentText = args.contentText;
      }
    }

    if (args.language !== undefined) {
      if (node.kind !== "artifact") {
        throw new Error("language is only valid on artifacts");
      }
      patch.language = args.language;
    }

    // agent (MCP) writes always checkpoint the pre-write state so the user can
    // see and undo exactly what the agent changed
    await applyWikiNodeUpdate(ctx, node, patch, {
      source: "mcp",
      authorUserId: userId,
      force: true,
    });
    return node._id;
  },
});

export const deleteByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), id: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const userId = await getUserIdByClerkId(ctx, args.clerkId);
    const node = await getOwnedNode(ctx, userId, args.id);
    if (!node) {
      throw new Error("Not found");
    }
    return await deleteWikiSubtree(ctx, userId, node._id);
  },
});
