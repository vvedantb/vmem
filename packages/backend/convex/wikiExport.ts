// One-off operator export for the Verve import. REMOVE this file (and
// scripts/export-wiki.ts) in a follow-up PR after the owner confirms the import.
//
// The vmem wiki feature is gone. Its tables (wikiNodes, wikiNodeVersions) stay
// in the schema, DEPRECATED, so this export can read them. Internal only: no
// client can call it.
//
// Prod command:
//   cd packages/backend && CONVEX_DEPLOYMENT=prod:clear-bear-690 npx convex run wikiExport:exportAll --pretty
//
// Reads are bounded: rows load in batches of 100 by creation time. Prod holds
// 14 nodes and 0 versions, so one call is far below Convex read limits.
import { type Infer, v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const BATCH_SIZE = 100;
const VERVE_OWNER_FOLDER = "vmem wiki";
const DEFAULT_ARTIFACT_LANGUAGE = "txt";

type WikiNodeDoc = Doc<"wikiNodes">;
type ExportKind = "folder" | "document" | "artifact";

const exportedVersion = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  contentText: v.string(),
  language: v.union(v.string(), v.null()),
  authorUserId: v.string(),
  source: v.union(v.literal("web"), v.literal("mcp")),
  createdAtMs: v.number(),
  createdAtIso: v.string(),
});

const exportedNode = v.object({
  id: v.string(),
  kind: v.union(
    v.literal("folder"),
    v.literal("document"),
    v.literal("artifact"),
  ),
  title: v.string(),
  content: v.union(v.string(), v.null()),
  contentText: v.union(v.string(), v.null()),
  language: v.union(v.string(), v.null()),
  parentId: v.union(v.string(), v.null()),
  order: v.number(),
  hierarchy: v.object({
    depth: v.number(),
    ancestorIds: v.array(v.string()),
  }),
  folderPath: v.string(),
  owner: v.object({
    userId: v.string(),
    clerkUserId: v.union(v.string(), v.null()),
  }),
  teamId: v.union(v.string(), v.null()),
  createdAtMs: v.number(),
  createdAtIso: v.string(),
  updatedAtMs: v.number(),
  updatedAtIso: v.string(),
  markdown: v.string(),
  suggestedVerveImport: v.object({
    ownerFolder: v.string(),
    pathUnderOwnerFolder: v.string(),
    pageTitle: v.string(),
  }),
  versions: v.array(exportedVersion),
});

async function loadAllNodes(ctx: QueryCtx): Promise<WikiNodeDoc[]> {
  const nodes: WikiNodeDoc[] = [];
  let after = -1;
  for (;;) {
    const batch = await ctx.db
      .query("wikiNodes")
      .withIndex("by_creation_time", (q) => q.gt("_creationTime", after))
      .take(BATCH_SIZE);
    nodes.push(...batch);
    const last = batch[batch.length - 1];
    if (batch.length < BATCH_SIZE || last === undefined) return nodes;
    after = last._creationTime;
  }
}

async function loadVersions(ctx: QueryCtx, nodeId: Id<"wikiNodes">) {
  const versions: Doc<"wikiNodeVersions">[] = [];
  let after = -1;
  for (;;) {
    const batch = await ctx.db
      .query("wikiNodeVersions")
      .withIndex("by_node", (q) =>
        q.eq("nodeId", nodeId).gt("_creationTime", after),
      )
      .take(BATCH_SIZE);
    versions.push(...batch);
    const last = batch[batch.length - 1];
    if (batch.length < BATCH_SIZE || last === undefined) return versions;
    after = last._creationTime;
  }
}

// ancestor ids from the root down to the direct parent. stops on a cycle or a
// dangling parent so bad data cannot loop.
function ancestorsOf(
  node: WikiNodeDoc,
  byId: Map<Id<"wikiNodes">, WikiNodeDoc>,
): WikiNodeDoc[] {
  const chain: WikiNodeDoc[] = [];
  const seen = new Set<Id<"wikiNodes">>([node._id]);
  let parentId = node.parentId;
  while (parentId !== undefined && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (parent === undefined) break;
    seen.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

function renderMarkdown(kind: ExportKind, node: WikiNodeDoc): string {
  if (kind === "folder") return `# ${node.title}\n`;
  const body = node.content ?? "";
  if (kind === "document") return body;
  const language = node.language ?? DEFAULT_ARTIFACT_LANGUAGE;
  return `\`\`\`${language}\n${body}\n\`\`\`\n`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export const exportAll = internalQuery({
  args: {},
  returns: v.object({
    nodeCount: v.number(),
    versionCount: v.number(),
    nodes: v.array(exportedNode),
  }),
  handler: async (ctx) => {
    const docs = await loadAllNodes(ctx);
    const byId = new Map(docs.map((d) => [d._id, d]));
    const clerkIds = new Map<Id<"users">, string | null>();

    let versionCount = 0;
    const nodes: Infer<typeof exportedNode>[] = [];
    for (const node of docs) {
      if (!clerkIds.has(node.userId)) {
        const user = await ctx.db.get(node.userId);
        clerkIds.set(node.userId, user?.clerkId ?? null);
      }
      const ancestors = ancestorsOf(node, byId);
      const folderPath = ancestors.map((a) => a.title).join("/");
      const versions = (await loadVersions(ctx, node._id)).map((ver) => ({
        id: ver._id,
        title: ver.title,
        content: ver.content,
        contentText: ver.contentText,
        language: ver.language ?? null,
        authorUserId: ver.authorUserId,
        source: ver.source,
        createdAtMs: ver.createdAt,
        createdAtIso: iso(ver.createdAt),
      }));
      versionCount += versions.length;
      nodes.push({
        id: node._id,
        kind: node.kind,
        title: node.title,
        content: node.content ?? null,
        contentText: node.contentText ?? null,
        language: node.language ?? null,
        parentId: node.parentId ?? null,
        order: node.order,
        hierarchy: {
          depth: ancestors.length,
          ancestorIds: ancestors.map((a) => a._id),
        },
        folderPath,
        owner: {
          userId: node.userId,
          clerkUserId: clerkIds.get(node.userId) ?? null,
        },
        teamId: node.teamId ?? null,
        createdAtMs: node.createdAt,
        createdAtIso: iso(node.createdAt),
        updatedAtMs: node.updatedAt,
        updatedAtIso: iso(node.updatedAt),
        markdown: renderMarkdown(node.kind, node),
        suggestedVerveImport: {
          ownerFolder: VERVE_OWNER_FOLDER,
          pathUnderOwnerFolder: folderPath,
          pageTitle: node.title,
        },
        versions,
      });
    }

    return {
      nodeCount: nodes.length,
      versionCount,
      nodes,
    };
  },
});
