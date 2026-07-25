import { finished, pipeline } from "node:stream/promises";
import { text } from "node:stream/consumers";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import { z } from "zod";
import type { SourceFileBlob } from "../neo4j/codebase/parse";
import { MAX_FILES_PER_SYNC } from "../neo4j/codebaseService";
import { createGithubOctokit } from "./octokit";

const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const tarballBodySchema = z.union([
  z.instanceof(ArrayBuffer),
  z.instanceof(Uint8Array),
]);

function bufferFromTarballBody(
  data: z.infer<typeof tarballBodySchema>,
): Buffer {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}

// gitHub tarballs prefix paths with `owner-repo-sha/`
export function stripTarballRoot(entryPath: string): string | null {
  const slash = entryPath.indexOf("/");
  if (slash === -1) return null;
  return entryPath.slice(slash + 1);
}

function shouldIncludeRepoPath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("node_modules/")) return false;
  return TS_JS_EXTENSIONS.has(path.substring(path.lastIndexOf(".")));
}

async function drainStream(stream: Readable): Promise<void> {
  stream.resume();
  await finished(stream);
}

export async function extractTsJsFromTarball(
  buffer: Buffer,
): Promise<SourceFileBlob[]> {
  const blobs: SourceFileBlob[] = [];
  const parser = extract();

  parser.on("entry", (header, stream, next) => {
    void (async () => {
      const repoPath = stripTarballRoot(header.name);
      const isFile =
        header.type === "file" || header.type === "contiguous-file";
      if (!repoPath || !isFile || !shouldIncludeRepoPath(repoPath)) {
        await drainStream(stream);
        next();
        return;
      }
      blobs.push({
        path: repoPath,
        content: await text(stream),
      });
      next();
    })().catch((err: unknown) => {
      parser.destroy(err instanceof Error ? err : new Error(String(err)));
    });
  });

  await pipeline(Readable.from(buffer), createGunzip(), parser);
  return blobs;
}

export function assertRepositoryBlobs(
  blobs: SourceFileBlob[],
  repoOwner: string,
  repoName: string,
  branch: string,
): SourceFileBlob[] {
  if (blobs.length > MAX_FILES_PER_SYNC) {
    throw new Error(
      `Repository too large for Phase 1 sync (${blobs.length} files; limit ${MAX_FILES_PER_SYNC}).`,
    );
  }
  if (blobs.length === 0) {
    throw new Error(
      `No TS/JS source files found in ${repoOwner}/${repoName}@${branch}`,
    );
  }
  return blobs;
}

function readHttpStatus(err: Error): number | undefined {
  if (!("status" in err)) return undefined;
  const status = err.status;
  return typeof status === "number" ? status : undefined;
}

// download repo tarball and extract TS/JS sources (faster than per-file API)
export async function fetchRepositoryFromGithub(
  repoOwner: string,
  repoName: string,
  branch: string,
  githubToken: string,
): Promise<SourceFileBlob[]> {
  const octokit = createGithubOctokit(githubToken);

  try {
    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/tarball/{ref}",
      {
        owner: repoOwner,
        repo: repoName,
        ref: branch,
        headers: {
          accept: "application/vnd.github+json",
        },
      },
    );

    const buffer = bufferFromTarballBody(
      tarballBodySchema.parse(response.data),
    );
    return assertRepositoryBlobs(
      await extractTsJsFromTarball(buffer),
      repoOwner,
      repoName,
      branch,
    );
  } catch (err) {
    if (err instanceof Error) {
      const status = readHttpStatus(err);
      if (status !== undefined) {
        throw new Error(
          `GitHub tarball error for ${repoOwner}/${repoName}@${branch}: ${status} ${err.message}`,
          { cause: err },
        );
      }
    }
    throw err;
  }
}
