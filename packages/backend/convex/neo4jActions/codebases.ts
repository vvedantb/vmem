"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { CodebaseService } from "../../src/neo4j/codebaseService";
import { getDriver } from "../../src/neo4j/driver";
import { parseImports, resolveImportPath } from "../../src/neo4j/importParser";

const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export const syncCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    githubToken: v.string(),
  },
  handler: async (_ctx, args) => {
    // Step 1: Fetch the repo tree from GitHub
    const treeUrl = `https://api.github.com/repos/${args.repoOwner}/${args.repoName}/git/trees/${args.branch}?recursive=1`;
    const treeResponse = await fetch(treeUrl, {
      headers: {
        Authorization: `Bearer ${args.githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!treeResponse.ok) {
      const text = await treeResponse.text();
      throw new Error(`GitHub tree API error: ${treeResponse.status} ${text}`);
    }

    const treeData: {
      tree: Array<{ path: string; type: string; size?: number }>;
    } = await treeResponse.json();

    // Filter to files only (not directories), limit to TS/JS
    const files = treeData.tree.filter((item) => {
      if (item.type !== "blob") return false;
      const ext = item.path.substring(item.path.lastIndexOf("."));
      return TS_JS_EXTENSIONS.has(ext);
    });

    const fileTree = new Set(files.map((f) => f.path));

    // Step 2: Fetch file contents and parse imports
    const fileInputs: Array<{
      path: string;
      directory: string;
      filename: string;
      extension: string;
      sizeBytes: number;
    }> = [];

    const edgeInputs: Array<{
      sourcePath: string;
      targetPath: string;
      importPath: string;
    }> = [];

    // Fetch files in batches
    const BATCH_SIZE = 20;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const contentPromises = batch.map(async (file) => {
        const contentUrl = `https://api.github.com/repos/${args.repoOwner}/${args.repoName}/contents/${file.path}?ref=${args.branch}`;
        const resp = await fetch(contentUrl, {
          headers: {
            Authorization: `Bearer ${args.githubToken}`,
            Accept: "application/vnd.github.raw+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });

        if (!resp.ok) return null;
        const content = await resp.text();
        return { path: file.path, content, size: file.size ?? 0 };
      });

      const results = await Promise.all(contentPromises);
      for (const result of results) {
        if (!result) continue;

        const lastSlash = result.path.lastIndexOf("/");
        const directory =
          lastSlash >= 0 ? result.path.substring(0, lastSlash) : "";
        const filename =
          lastSlash >= 0 ? result.path.substring(lastSlash + 1) : result.path;
        const extDot = filename.lastIndexOf(".");
        const extension = extDot >= 0 ? filename.substring(extDot) : "";

        fileInputs.push({
          path: result.path,
          directory,
          filename,
          extension,
          sizeBytes: result.size,
        });

        // Parse imports and resolve them
        const imports = parseImports(result.content);
        for (const imp of imports) {
          const resolved = resolveImportPath(imp, result.path, fileTree);
          if (resolved) {
            edgeInputs.push({
              sourcePath: result.path,
              targetPath: resolved,
              importPath: imp,
            });
          }
        }
      }
    }

    // Step 3: Write to Neo4j
    const service = new CodebaseService(getDriver());
    return await service.syncCodebase(
      args.clerkId,
      args.codebaseId,
      fileInputs,
      edgeInputs,
    );
  },
});

export const getCodebaseGraphInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new CodebaseService(getDriver());
    return await service.getCodebaseGraph(args.clerkId, args.codebaseId);
  },
});

export const deleteCodebaseInternal = internalAction({
  args: {
    clerkId: v.string(),
    codebaseId: v.string(),
  },
  handler: async (_ctx, args) => {
    const service = new CodebaseService(getDriver());
    await service.deleteCodebase(args.clerkId, args.codebaseId);
    return null;
  },
});
