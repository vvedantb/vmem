import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { extract } from "tar-stream";
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

const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
} as const;

const FETCH_ATTEMPTS = 3;

/** Encode each path segment for GitHub contents URLs ($id, spaces, etc.). */
export function encodeGithubContentPath(repoPath: string): string {
  return repoPath.split("/").map(encodeURIComponent).join("/");
}

/** GitHub tarballs prefix paths with `owner-repo-sha/`. */
export function stripTarballRoot(entryPath: string): string | null {
  const slash = entryPath.indexOf("/");
  if (slash === -1) return null;
  return entryPath.slice(slash + 1);
}

function isTsJsPath(path: string): boolean {
  const ext = path.substring(path.lastIndexOf("."));
  return TS_JS_EXTENSIONS.has(ext);
}

function shouldIncludeRepoPath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith("node_modules/")) return false;
  return isTsJsPath(path);
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
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt === FETCH_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  const cause = lastErr ? readFetchCause(lastErr) : undefined;
  const detail = lastErr?.message ?? "unknown error";
  throw new Error(
    `GitHub ${label} failed after ${FETCH_ATTEMPTS} attempts: ${detail}${cause ? ` (${cause})` : ""}`,
  );
}

async function extractTsJsFromTarball(
  buffer: Buffer,
): Promise<SourceFileBlob[]> {
  return new Promise((resolve, reject) => {
    const blobs: SourceFileBlob[] = [];
    const parser = extract();

    parser.on("entry", (header, stream, next) => {
      const repoPath = stripTarballRoot(header.name);
      const isFile =
        header.type === "file" || header.type === "contiguous-file";
      if (!repoPath || !isFile || !shouldIncludeRepoPath(repoPath)) {
        stream.resume();
        stream.on("end", () => next());
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        blobs.push({
          path: repoPath,
          content: Buffer.concat(chunks).toString("utf8"),
        });
        next();
      });
      stream.on("error", reject);
    });

    parser.on("finish", () => resolve(blobs));
    parser.on("error", reject);

    Readable.from(buffer).pipe(createGunzip()).on("error", reject).pipe(parser);
  });
}

/**
 * Download the repo tarball once and extract TS/JS sources. Much faster than
 * hundreds of per-file contents API calls (eva ~707 files).
 */
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
        ...GITHUB_API_HEADERS,
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
  const blobs = await extractTsJsFromTarball(buffer);

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
