import { finished, pipeline } from "node:stream/promises";
import { text } from "node:stream/consumers";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { extract } from "tar-stream";
import pRetry from "p-retry";
import type { SourceFileBlob } from "../neo4j/codebase/parse";
import { MAX_FILES_PER_SYNC } from "../neo4j/codebaseService";

const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const GITHUB_TARBALL_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

const FETCH_ATTEMPTS = 3;

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

function readFetchCause(err: Error): string | undefined {
  if (!("cause" in err)) return undefined;
  const cause = err.cause;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return undefined;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  try {
    return await pRetry(async () => fetch(url, init), {
      retries: FETCH_ATTEMPTS - 1,
      minTimeout: 400,
      factor: 1,
      randomize: true,
    });
  } catch (err) {
    const lastErr = err instanceof Error ? err : new Error(String(err));
    const detail = lastErr.message;
    const nestedCause = readFetchCause(lastErr);
    throw Object.assign(
      new Error(
        `GitHub ${label} failed after ${FETCH_ATTEMPTS} attempts: ${detail}${nestedCause ? ` (${nestedCause})` : ""}`,
      ),
      { cause: err },
    );
  }
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

// download repo tarball and extract TS/JS sources (faster than per-file API)
export async function fetchRepositoryFromGithub(
  repoOwner: string,
  repoName: string,
  branch: string,
  githubToken: string,
): Promise<SourceFileBlob[]> {
  const tarballUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/tarball/${encodeURIComponent(branch)}`;
  const tarballResponse = await fetchWithRetry(
    tarballUrl,
    {
      headers: {
        ...GITHUB_TARBALL_HEADERS,
        Authorization: `Bearer ${githubToken}`,
      },
      redirect: "follow",
    },
    `tarball ${repoOwner}/${repoName}@${branch}`,
  );

  if (!tarballResponse.ok) {
    const text = await tarballResponse.text();
    throw new Error(
      `GitHub tarball error for ${repoOwner}/${repoName}@${branch}: ${tarballResponse.status} ${text}`,
    );
  }

  const buffer = Buffer.from(await tarballResponse.arrayBuffer());
  return assertRepositoryBlobs(
    await extractTsJsFromTarball(buffer),
    repoOwner,
    repoName,
    branch,
  );
}
