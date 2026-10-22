import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  artifactRefLabel,
  createArtifactStateStore,
  sortArtifactRefs,
  toVersionSummaries,
  type ArtifactRef,
} from "./_artifactsUtils";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

describe("createArtifactStateStore", () => {
  it("loads the saved map, or an empty one when there is no state row", async () => {
    const onError = vi.fn();
    const saved = createArtifactStateStore({
      load: async () => ({ data: { score: "3" } }),
      put: async (patch) => ({ data: patch.sets }),
      onError,
    });
    await expect(saved.load()).resolves.toEqual({ score: "3" });

    const none = createArtifactStateStore({
      load: async () => null,
      put: async (patch) => ({ data: patch.sets }),
      onError,
    });
    await expect(none.load()).resolves.toEqual({});
    expect(none).toHaveProperty("onError", onError);
  });

  it("saves the whole map as one reset + sets write", async () => {
    const put = vi.fn(async (patch: { sets: Record<string, string> }) => ({
      data: patch.sets,
    }));
    const store = createArtifactStateStore({
      load: async () => null,
      put,
      onError: undefined,
    });
    await store.save({ a: "1", b: "2" });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith({ sets: { a: "1", b: "2" }, reset: true });
  });

  it("lets a failed save reject so the frame reports it", async () => {
    const store = createArtifactStateStore({
      load: async () => null,
      put: async () => {
        throw new Error("State writes are limited to one per second");
      },
      onError: undefined,
    });
    await expect(store.save({ a: "1" })).rejects.toThrow("one per second");
  });
});

describe("toVersionSummaries", () => {
  it("keeps version and time, and a title only when it differs", () => {
    expect(
      toVersionSummaries(
        [
          { version: 2, title: "Quiz", createdAt: 20, createdBy: "web" },
          { version: 1, title: "Draft quiz", createdAt: 10, createdBy: "mcp" },
        ],
        "Quiz",
      ),
    ).toEqual([
      { version: 2, createdAt: 20, title: undefined },
      { version: 1, createdAt: 10, title: "Draft quiz" },
    ]);
  });
});

describe("artifact refs", () => {
  const ref = (
    kind: ArtifactRef["kind"],
    target: string,
    createdAt: number,
  ): ArtifactRef => ({ kind, target, createdAt });

  it("puts memory refs first, newest first within a kind", () => {
    const sorted = sortArtifactRefs([
      ref("app", "vibot:project:1", 5),
      ref("memory", "m-old", 1),
      ref("file", "f1", 9),
      ref("memory", "m-new", 3),
    ]);
    expect(sorted.map((r) => r.target)).toEqual([
      "m-new",
      "m-old",
      "f1",
      "vibot:project:1",
    ]);
  });

  it("labels every ref kind", () => {
    expect(artifactRefLabel({ kind: "memory" })).toBe("Memory");
    expect(artifactRefLabel({ kind: "app" })).toBe("App");
  });
});

// vmem rule: every action on the Artifacts page is also an MCP tool
describe("artifacts page / MCP parity", () => {
  const apiToTool: Record<string, string> = {
    list: "artifacts_list",
    search: "artifacts_search",
    get: "artifacts_get",
    update: "artifacts_update",
    remove: "artifacts_delete",
    restore: "artifacts_restore",
    history: "artifacts_history",
    getVersion: "artifacts_version_get",
    restoreVersion: "artifacts_restore_version",
    getState: "artifacts_state_get",
    putState: "artifacts_state_set",
    // artifacts_get returns refs
    refs: "artifacts_get",
  };

  it("maps each artifacts api call on the page to an MCP tool", () => {
    const pageSource = [
      "ArtifactsPanel.tsx",
      "ArtifactDetailPanel.tsx",
      "useArtifactActions.ts",
    ]
      .map(read)
      .join("\n");
    const used = new Set(
      [...pageSource.matchAll(/api\.artifacts\.api\.(\w+)/g)].flatMap(
        (match) => match[1] ?? [],
      ),
    );
    const tools = read(
      "../../../../../packages/backend/convex/mcp/toolsArtifacts.ts",
    );
    expect(used.size).toBeGreaterThan(0);
    for (const fn of used) {
      expect(Object.keys(apiToTool)).toContain(fn);
      expect(tools).toContain(`name: "${apiToTool[fn]}"`);
    }
    expect(
      read("../../../../../packages/backend/convex/artifacts/mcp.ts"),
    ).toContain("refs: await listArtifactRefs");
  });
});
