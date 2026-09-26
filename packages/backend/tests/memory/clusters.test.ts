import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  clusterNearDuplicateMemories,
  isRejectedMerge,
  pickClusterKeeper,
} from "../../engine/memory/clusters";

function memory(
  overrides: Partial<MemoryWithTags> &
    Pick<MemoryWithTags, "id" | "title" | "content">,
): MemoryWithTags {
  return {
    userId: "user_a",
    profileId: "profile_a",
    type: "knowledge",
    source: "api",
    sourceType: null,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.9,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: [],
    ...overrides,
  };
}

describe("clusterNearDuplicateMemories", () => {
  it("clusters exact and near-duplicate facts and ignores unrelated rows", () => {
    const a = memory({
      id: "a",
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
    });
    const b = memory({
      id: "b",
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
    });
    const extra = memory({
      id: "c",
      title: "Use pnpm for the vmem monorepo",
      content: "Use pnpm for the vmem monorepo",
    });
    const london = memory({
      id: "d",
      title: "Lives in London",
      content: "Based in London, UK.",
    });
    const exact = clusterNearDuplicateMemories([a, b, london]);
    expect(exact).toHaveLength(1);
    expect(exact[0]?.memories.map((row) => row.id).sort()).toEqual(["a", "b"]);

    const near = clusterNearDuplicateMemories([a, extra, london], {
      jaccard: 0.5,
    });
    expect(near).toHaveLength(1);
    expect(near[0]?.memories.map((row) => row.id).sort()).toEqual(["a", "c"]);
  });

  it("skips suppressed rows", () => {
    const a = memory({
      id: "a",
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
    });
    const hidden = memory({
      id: "b",
      title: "Use pnpm for vmem",
      content: "Use pnpm for vmem",
      status: "suppressed",
    });
    expect(clusterNearDuplicateMemories([a, hidden])).toEqual([]);
  });

  it("skips clusters the user already rejected before applying the limit", () => {
    const a = memory({ id: "a", title: "Use pnpm", content: "Use pnpm" });
    const b = memory({ id: "b", title: "Use pnpm", content: "Use pnpm" });
    const c = memory({ id: "c", title: "Lives in London", content: "London" });
    const d = memory({ id: "d", title: "Lives in London", content: "London" });
    const clusters = clusterNearDuplicateMemories([a, b, c, d], {
      limit: 1,
      rejectedSourceSets: [["b", "a"]],
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.memories.map((row) => row.id).sort()).toEqual([
      "c",
      "d",
    ]);
  });

  it("re-proposes a rejected cluster once a new memory joins it", () => {
    const a = memory({ id: "a", title: "Use pnpm", content: "Use pnpm" });
    const b = memory({ id: "b", title: "Use pnpm", content: "Use pnpm" });
    const fresh = memory({ id: "e", title: "Use pnpm", content: "Use pnpm" });
    const clusters = clusterNearDuplicateMemories([a, b, fresh], {
      rejectedSourceSets: [["a", "b"]],
    });
    expect(clusters[0]?.memories.map((row) => row.id).sort()).toEqual([
      "a",
      "b",
      "e",
    ]);
  });
});

describe("isRejectedMerge", () => {
  it("matches when every id sits inside one rejected set", () => {
    expect(isRejectedMerge(["a", "b"], [["a", "b", "c"]])).toBe(true);
    expect(isRejectedMerge(["a", "b"], [["a"], ["b"]])).toBe(false);
    expect(isRejectedMerge(["a", "b"], [])).toBe(false);
  });
});

describe("pickClusterKeeper", () => {
  it("keeps the longest then newest row", () => {
    const short = memory({
      id: "short",
      title: "pnpm",
      content: "Use pnpm",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    const long = memory({
      id: "long",
      title: "pnpm",
      content: "Use pnpm for the vmem monorepo",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(pickClusterKeeper([short, long]).id).toBe("long");
  });
});
