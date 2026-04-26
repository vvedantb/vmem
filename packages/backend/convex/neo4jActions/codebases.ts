"use node";

/**
 * Phase 1 codebase parser actions. Runs in the Node.js runtime so we can
 * use `neo4j-driver` and `ts-morph` (both depend on Node built-ins).
 *
 * Stages, with `parseStage` patched on the codebases row at each one:
 *   1. fetching   — pull the file tree + raw blobs from GitHub
 *   2. parsing    — ts-morph AST walk
 *   3. processes  — entry-point detection + BFS process construction
 *   4. writing    — bulk Neo4j writes
 *   5. done
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import {
  syncCodebase,
  getOverviewStats,
  getGraphOverview,
  getSymbolContext,
  searchSymbols,
  getDownstreamImpact,
  getUpstreamImpact,
  deleteCodebase,
  MAX_FILES_PER_SYNC,
  type SyncStage,
} from "../../src/neo4j/codebaseService";
import { getDriver } from "../../src/neo4j/driver";
import type { SourceFileBlob } from "../../src/neo4j/codebase/parse";

const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

interface GitHubTreeFile {
  path: string;
  type: string;
  size?: number;
}

const stageValidator = v.union(
  v.literal("fetching"),
  v.literal("parsing"),
  v.literal("processes"),
  v.literal("writing"),
  v.literal("done"),
);

/**
 * Pull the repo tree + blobs from GitHub. Throws on non-2xx so the
 * outer action can surface a clear error message via `lastParseError`.
 */
async function fetchRepository(
  repoOwner: string,
  repoName: string,
  branch: string,
  githubToken: string,
): Promise<SourceFileBlob[]> {
  const treeUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${branch}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!treeResponse.ok) {
    const text = await treeResponse.text();
    throw new Error(`GitHub tree API error: ${treeResponse.status} ${text}`);
  }
  const treeData: { tree: GitHubTreeFile[] } = await treeResponse.json();
  const files = treeData.tree.filter((item) => {
    if (item.type !== "blob") return false;
    const ext = item.path.substring(item.path.lastIndexOf("."));
    return TS_JS_EXTENSIONS.has(ext);
  });

  if (files.length > MAX_FILES_PER_SYNC) {
    throw new Error(
      `Repository too large for Phase 1 sync (${files.length} files; limit ${MAX_FILES_PER_SYNC}).`,
    );
  }

  // Fetch in batches of 20 to respect GitHub rate limits + keep memory bounded.
  const BATCH_SIZE = 20;
  const blobs: SourceFileBlob[] = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const contentUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${file.path}?ref=${branch}`;
        const resp = await fetch(contentUrl, {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        if (!resp.ok) return null;
        const content = await resp.text();
        return { path: file.path, content };
      }),
    );
    for (const result of results) {
      if (result) blobs.push(result);
    }
  }
  return blobs;
}

export const syncCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    githubToken: v.string(),
  },
  handler: async (ctx, args) => {
    // Step 1: Fetch.
    const files = await fetchRepository(
      args.repoOwner,
      args.repoName,
      args.branch,
      args.githubToken,
    );

    // Resolve the codebases doc id from the string id so we can patch progress.
    const docId = await ctx.runQuery(internal.codebases.normalizeCodebaseId, {
      id: args.codebaseId,
    });

    const patchStage = async (stage: SyncStage): Promise<void> => {
      if (!docId) return;
      await ctx.runMutation(internal.codebases.updateStatusInternal, {
        id: docId,
        parseStage: stage,
      });
    };

    // Steps 2–5 happen inside `syncCodebase`. The onStage callback
    // patches the codebases row so the live useQuery on the page can
    // show "parsing… → processes… → writing… → done" mid-sync.
    return await syncCodebase({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      files,
      onStage: patchStage,
    });
  },
});

export const getOverviewStatsInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getOverviewStats({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
    });
  },
});

const kindValidator = v.union(
  v.literal("code-file"),
  v.literal("code-function"),
  v.literal("code-class"),
  v.literal("code-interface"),
  v.literal("code-process"),
);

const directionValidator = v.union(
  v.literal("upstream"),
  v.literal("downstream"),
);

export const getGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    kinds: v.optional(v.array(kindValidator)),
    processId: v.optional(v.string()),
    blastRadiusOf: v.optional(v.string()),
    blastDirection: v.optional(directionValidator),
    blastDepth: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    return await getGraphOverview({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      kinds: args.kinds,
      processId: args.processId,
      blastRadiusOf: args.blastRadiusOf,
      blastDirection: args.blastDirection,
      blastDepth: args.blastDepth,
    });
  },
});

export const getSymbolContextInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
  },
  handler: async (_ctx, args) => {
    return await getSymbolContext({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      symbolId: args.symbolId,
    });
  },
});

export const getImpactInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    symbolId: v.string(),
    direction: directionValidator,
    depth: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const driver = getDriver();
    const nodes =
      args.direction === "upstream"
        ? await getUpstreamImpact({
            driver,
            userId: args.clerkId,
            codebaseId: args.codebaseId,
            symbolId: args.symbolId,
            depth: args.depth,
          })
        : await getDownstreamImpact({
            driver,
            userId: args.clerkId,
            codebaseId: args.codebaseId,
            symbolId: args.symbolId,
            depth: args.depth,
          });
    return { nodes };
  },
});

export const searchSymbolsInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    query: v.string(),
    kind: v.optional(kindValidator),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    const results = await searchSymbols({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      query: args.query,
      kind: args.kind,
      limit: args.limit,
    });
    return { results };
  },
});

/**
 * Backwards-compatible wrapper for the old graph reader. The web is
 * being migrated to `getGraphInternal`, but the old endpoint stays
 * around so we don't ship a deploy that breaks the dashboard if the
 * web rollout lags behind.
 */
export const getCodebaseGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    const overview = await getGraphOverview({
      driver: getDriver(),
      userId: args.clerkId,
      codebaseId: args.codebaseId,
      kinds: ["code-file"],
    });
    // Translate to the old wire shape.
    const idToPath = new Map<string, string>();
    const nodes = overview.nodes.map((n) => {
      idToPath.set(n.id, n.path);
      const filename = n.name;
      const ext = filename.includes(".")
        ? filename.slice(filename.lastIndexOf("."))
        : "";
      return {
        id: n.id,
        path: n.path,
        directory: n.directory,
        filename,
        extension: ext,
        sizeBytes: 0,
      };
    });
    const edges = overview.edges
      .filter((e) => e.type === "imports")
      .map((e) => ({
        source: e.fromId,
        target: e.toId,
        importPath: "",
      }));
    return { nodes, edges };
  },
});

export const deleteCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    await deleteCodebase(getDriver(), args.clerkId, args.codebaseId);
    return null;
  },
});
