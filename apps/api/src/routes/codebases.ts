import { Hono } from "hono";
import { CodebaseService } from "../db/codebase-service";
import { getDriver } from "../db/neo4j";
import { parseImports, resolveImportPath } from "../utils/import-parser";

function getService(): CodebaseService {
  return new CodebaseService(getDriver());
}

// In-memory cache for graph data
const CACHE_TTL_MS = 60_000;
type GraphData = Awaited<ReturnType<CodebaseService["getCodebaseGraph"]>>;
const cache = new Map<string, { data: GraphData; expiresAt: number }>();

function getCached(key: string): GraphData | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: GraphData): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

interface GitHubTreeItem {
  path: string;
  type: string;
  size: number | undefined;
}

interface SyncRequestBody {
  codebaseId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  githubToken: string;
}

const codebases = new Hono<{ Variables: { userId: string } }>();

/**
 * POST /sync — sync a codebase from GitHub.
 * Auth: accepts either Clerk/MCP Bearer token (via authMiddleware on parent)
 * OR X-Internal-Secret header for Convex action calls.
 * This route is mounted WITHOUT authMiddleware so internal calls can reach it.
 */
codebases.post("/sync", async (c) => {
  // Determine userId: try internal secret first, then check for auth header
  let userId: string | undefined;

  const internalSecret = c.req.header("X-Internal-Secret");
  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (internalSecret && expectedSecret && internalSecret === expectedSecret) {
    // Internal auth from Convex actions
    const headerUserId = c.req.header("X-User-Id");
    if (headerUserId) {
      userId = headerUserId;
    }
  }

  if (!userId) {
    // Fall back to standard auth — try getting userId that authMiddleware would set
    // We manually check the Authorization header here since this route bypasses authMiddleware
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // For non-internal callers, require proper auth via the parent route middleware
    // Since this route is only called internally, return 401 if no internal secret matched
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body: SyncRequestBody = await c.req.json();

  try {
    console.log(
      `[codebases] syncing ${body.repoOwner}/${body.repoName}@${body.branch}`,
    );
    const t0 = performance.now();

    // 1. Fetch repo tree from GitHub
    const treeUrl = `https://api.github.com/repos/${body.repoOwner}/${body.repoName}/git/trees/${body.branch}?recursive=true`;
    const treeRes = await fetch(treeUrl, {
      headers: {
        Authorization: `Bearer ${body.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!treeRes.ok) {
      const text = await treeRes.text();
      return c.json(
        { error: `GitHub tree API failed: ${treeRes.status}`, detail: text },
        502,
      );
    }

    const treeData: { tree: GitHubTreeItem[]; truncated: boolean } =
      await treeRes.json();

    // 2. Filter to TS/JS files only
    const tsJsFiles = treeData.tree.filter((item) => {
      if (item.type !== "blob") return false;
      const ext = item.path.substring(item.path.lastIndexOf("."));
      return TS_JS_EXTENSIONS.has(ext);
    });

    console.log(
      `[codebases] found ${tsJsFiles.length} TS/JS files out of ${treeData.tree.length} total`,
    );

    // Build full file tree set for import resolution (all blobs, not just TS/JS)
    const fileTree = new Set(
      treeData.tree.filter((i) => i.type === "blob").map((i) => i.path),
    );

    // 3. Fetch content for each TS/JS file and parse imports
    const fileInputs: Array<{
      path: string;
      directory: string;
      filename: string;
      extension: string;
      sizeBytes: number;
    }> = [];

    type EdgeInput = {
      sourcePath: string;
      targetPath: string;
      importPath: string;
    };

    const edgeInputs: EdgeInput[] = [];

    // Process files in batches to avoid GitHub API rate limiting
    const FETCH_BATCH = 20;
    for (let i = 0; i < tsJsFiles.length; i += FETCH_BATCH) {
      const batch = tsJsFiles.slice(i, i + FETCH_BATCH);

      const results = await Promise.all(
        batch.map(async (file) => {
          const lastSlash = file.path.lastIndexOf("/");
          const directory =
            lastSlash >= 0 ? file.path.substring(0, lastSlash) : "";
          const filename =
            lastSlash >= 0 ? file.path.substring(lastSlash + 1) : file.path;
          const extension = filename.substring(filename.lastIndexOf("."));

          const fileInput = {
            path: file.path,
            directory,
            filename,
            extension,
            sizeBytes: file.size ?? 0,
          };

          // Fetch file content to parse imports
          try {
            const contentUrl = `https://api.github.com/repos/${body.repoOwner}/${body.repoName}/contents/${file.path}?ref=${body.branch}`;
            const contentRes = await fetch(contentUrl, {
              headers: {
                Authorization: `Bearer ${body.githubToken}`,
                Accept: "application/vnd.github.raw+json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            });

            if (!contentRes.ok) {
              return { fileInput, imports: new Array<EdgeInput>() };
            }

            const content = await contentRes.text();
            const rawImports = parseImports(content);

            const resolvedEdges = rawImports
              .map((imp) => {
                const resolved = resolveImportPath(imp, file.path, fileTree);
                if (!resolved) return null;
                return {
                  sourcePath: file.path,
                  targetPath: resolved,
                  importPath: imp,
                };
              })
              .filter(
                (
                  e,
                ): e is {
                  sourcePath: string;
                  targetPath: string;
                  importPath: string;
                } => e !== null,
              );

            return { fileInput, imports: resolvedEdges };
          } catch {
            return { fileInput, imports: new Array<EdgeInput>() };
          }
        }),
      );

      for (const result of results) {
        fileInputs.push(result.fileInput);
        edgeInputs.push(...result.imports);
      }
    }

    // 4. Write to Neo4j
    const service = getService();
    const syncResult = await service.syncCodebase(
      userId,
      body.codebaseId,
      fileInputs,
      edgeInputs,
    );

    // Invalidate cache
    cache.delete(`${userId}:${body.codebaseId}`);

    const ms = (performance.now() - t0).toFixed(1);
    console.log(
      `[codebases] sync complete in ${ms}ms — ${syncResult.totalFiles} files, ${syncResult.totalEdges} edges`,
    );

    return c.json(syncResult);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[codebases] sync failed:", err);
    return c.json({ error: "Sync failed", detail: message }, 500);
  }
});

/**
 * GET /:codebaseId/graph — get file graph for a codebase.
 * Protected by authMiddleware (applied in index.ts).
 */
codebases.get("/:codebaseId/graph", async (c) => {
  const userId = c.get("userId");
  const codebaseId = c.req.param("codebaseId");

  const cacheKey = `${userId}:${codebaseId}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[codebases] cache hit for ${cacheKey}`);
    return c.json(cached);
  }

  try {
    const service = getService();
    const t0 = performance.now();
    const data = await service.getCodebaseGraph(userId, codebaseId);
    const ms = (performance.now() - t0).toFixed(1);
    console.log(
      `[codebases] graph query took ${ms}ms — ${data.nodes.length} nodes, ${data.edges.length} edges`,
    );

    setCache(cacheKey, data);
    return c.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[codebases] graph fetch failed:", err);
    return c.json({ error: "Failed to fetch graph", detail: message }, 500);
  }
});

/**
 * DELETE /:codebaseId — delete codebase data from Neo4j.
 * Protected by authMiddleware (applied in index.ts).
 */
codebases.delete("/:codebaseId", async (c) => {
  const userId = c.get("userId");
  const codebaseId = c.req.param("codebaseId");

  try {
    const service = getService();
    await service.deleteCodebase(userId, codebaseId);
    cache.delete(`${userId}:${codebaseId}`);
    return c.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[codebases] delete failed:", err);
    return c.json({ error: "Failed to delete", detail: message }, 500);
  }
});

export { codebases };
