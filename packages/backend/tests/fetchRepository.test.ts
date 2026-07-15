import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { pack } from "tar-stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRepositoryBlobs,
  extractTsJsFromTarball,
  fetchRepositoryFromGithub,
  stripTarballRoot,
} from "../engine/github/fetchRepository";
import { MAX_FILES_PER_SYNC } from "../engine/neo4j/codebaseService";

const TARBALL_PREFIX = "owner-repo-abc123";

interface TarEntry {
  name: string;
  content?: string;
  type?: "file" | "directory" | "symlink";
}

async function buildTarGz(entries: TarEntry[]): Promise<Buffer> {
  const archive = pack();
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      const done = (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      };
      if (entry.type === "directory") {
        archive.entry({ name: entry.name, type: "directory" }, done);
        return;
      }
      archive.entry(
        { name: entry.name, type: entry.type ?? "file" },
        entry.content ?? "",
        done,
      );
    });
  }
  archive.finalize();
  await pipeline(archive, createGzip(), sink);
  return Buffer.concat(chunks);
}

function prefixed(path: string): string {
  return `${TARBALL_PREFIX}/${path}`;
}

function mockTarballResponse(buffer: Buffer): Response {
  return new Response(new Uint8Array(buffer), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("stripTarballRoot", () => {
  it("removes the GitHub tarball prefix directory", () => {
    expect(stripTarballRoot("vvedantb-eva-abc123/apps/web/src/main.tsx")).toBe(
      "apps/web/src/main.tsx",
    );
  });

  it("returns null when there is no slash", () => {
    expect(stripTarballRoot("root-only")).toBeNull();
  });
});

describe("extractTsJsFromTarball", () => {
  it("keeps TS/JS files and strips the tarball root prefix", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("apps/web/src/main.tsx"), content: "export {}" },
      { name: prefixed("lib/util.mjs"), content: "export const x = 1" },
    ]);

    await expect(extractTsJsFromTarball(tarball)).resolves.toEqual([
      { path: "apps/web/src/main.tsx", content: "export {}" },
      { path: "lib/util.mjs", content: "export const x = 1" },
    ]);
  });

  it("filters node_modules paths and non-TS/JS extensions", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("src/index.ts"), content: "ok" },
      { name: prefixed("node_modules/pkg/index.js"), content: "skip" },
      { name: prefixed("README.md"), content: "skip" },
      { name: prefixed("assets/logo.png"), content: "skip" },
    ]);

    await expect(extractTsJsFromTarball(tarball)).resolves.toEqual([
      { path: "src/index.ts", content: "ok" },
    ]);
  });

  it("skips directory and symlink entries", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("src"), type: "directory" },
      { name: prefixed("link.ts"), type: "symlink" },
      { name: prefixed("src/real.ts"), content: "real" },
    ]);

    await expect(extractTsJsFromTarball(tarball)).resolves.toEqual([
      { path: "src/real.ts", content: "real" },
    ]);
  });

  it("returns an empty list for archives with no matching source files", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("README.md"), content: "docs only" },
      { name: prefixed("assets/style.css"), content: "body {}" },
    ]);

    await expect(extractTsJsFromTarball(tarball)).resolves.toEqual([]);
  });

  it("rejects corrupt gzip input", async () => {
    await expect(
      extractTsJsFromTarball(Buffer.from("not-a-gzip-archive")),
    ).rejects.toThrow();
  });
});

describe("assertRepositoryBlobs", () => {
  it("rejects repositories above the Phase 1 file limit", () => {
    const blobs = Array.from({ length: MAX_FILES_PER_SYNC + 1 }, (_, i) => ({
      path: `src/file-${String(i)}.ts`,
      content: "export {}",
    }));

    expect(() => assertRepositoryBlobs(blobs, "owner", "repo", "main")).toThrow(
      `Repository too large for Phase 1 sync (${String(MAX_FILES_PER_SYNC + 1)} files; limit ${String(MAX_FILES_PER_SYNC)}).`,
    );
  });

  it("rejects empty blob lists", () => {
    expect(() => assertRepositoryBlobs([], "owner", "repo", "main")).toThrow(
      "No TS/JS source files found in owner/repo@main",
    );
  });
});

describe("fetchRepositoryFromGithub", () => {
  it("retries transient fetch failures before succeeding", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("src/a.ts"), content: "export {}" },
    ]);
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("network flake");
        }
        return mockTarballResponse(tarball);
      }),
    );

    await expect(
      fetchRepositoryFromGithub("owner", "repo", "main", "token"),
    ).resolves.toEqual([{ path: "src/a.ts", content: "export {}" }]);
    expect(attempts).toBe(3);
  });

  it("throws after exhausting fetch retries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(
      fetchRepositoryFromGithub("owner", "repo", "main", "token"),
    ).rejects.toThrow(/failed after 3 attempts/);
  });

  it("surfaces GitHub archive HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );

    await expect(
      fetchRepositoryFromGithub("owner", "repo", "main", "token"),
    ).rejects.toThrow("GitHub tarball error for owner/repo@main: 404 missing");
  });

  it("rejects repositories with no TS/JS sources", async () => {
    const tarball = await buildTarGz([
      { name: prefixed("README.md"), content: "docs" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockTarballResponse(tarball)),
    );

    await expect(
      fetchRepositoryFromGithub("owner", "repo", "main", "token"),
    ).rejects.toThrow("No TS/JS source files found in owner/repo@main");
  });
});
