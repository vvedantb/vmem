import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import { relatedMemories, rankMemories } from "../../engine/memory/rank";
import { toMemoryCandidate } from "../../engine/memory/retrieve";

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

describe("rankMemories", () => {
  const pnpm = memory({
    id: "mem_pnpm",
    title: "Prefers pnpm",
    content: "Use pnpm for vmem",
    tags: ["tooling"],
  });
  const coffee = memory({
    id: "mem_coffee",
    title: "Coffee order",
    content: "Oat latte",
    tags: ["food"],
  });

  it("ranks an exact title hit first and fills trace channels", () => {
    const ranked = rankMemories([coffee, pnpm], "pnpm", { limit: 5 });
    expect(ranked[0]?.id).toBe("mem_pnpm");
    expect(ranked[0]?.trace.score).toBeGreaterThan(0.2);
    expect(ranked[0]?.trace.scoreBreakdown.fulltext).toBeGreaterThan(0);
    expect(ranked[0]?.trace.scoreBreakdown.rrf).toBeGreaterThan(0);
    expect(ranked[0]?.trace.reason).not.toContain("substring");
  });

  it("matches synonym queries that substring search would miss", () => {
    const ranked = rankMemories([coffee, pnpm], "package manager", {
      limit: 5,
    });
    expect(ranked[0]?.id).toBe("mem_pnpm");
  });

  it("uses vector scores when provided", () => {
    const ranked = rankMemories([pnpm, coffee], "unrelated query tokens zxqv", {
      limit: 2,
      vectorScores: new Map([
        ["mem_coffee", 0.95],
        ["mem_pnpm", 0.01],
      ]),
    });
    expect(ranked[0]?.id).toBe("mem_coffee");
    expect(ranked[0]?.trace.scoreBreakdown.vector).toBeGreaterThan(0.9);
  });

  it("drops unrelated rows when the query has no lexical signal", () => {
    const ranked = rankMemories([pnpm, coffee], "webpack bundler");
    expect(ranked.map((hit) => hit.id)).toEqual([]);
  });
});

describe("toMemoryCandidate", () => {
  const row = memory({
    id: "mem_1",
    title: "Prefers pnpm",
    content: "Use pnpm for vmem",
    tags: ["tooling"],
  });

  it("scores a present term above zero", () => {
    const hit = toMemoryCandidate(row, "pnpm");
    expect(hit.trace.score).toBeGreaterThan(0);
    expect(hit.trace.scoreBreakdown.fulltext).toBeGreaterThan(0);
    expect(hit.trace.scoreBreakdown.vector).toBe(0);
  });

  it("scores zero when the query is absent", () => {
    const miss = toMemoryCandidate(row, "webpack");
    expect(miss.trace.score).toBe(0);
    expect(miss.trace.scoreBreakdown.vector).toBe(0);
  });
});

describe("relatedMemories", () => {
  it("returns tag overlap before unrelated rows", () => {
    const seed = memory({
      id: "seed",
      title: "Prefers pnpm",
      content: "Use pnpm",
      tags: ["tooling"],
    });
    const hits = relatedMemories(seed, [
      memory({
        id: "tool",
        title: "Node version",
        content: "Use Node 22",
        tags: ["tooling"],
      }),
      memory({
        id: "food",
        title: "Coffee",
        content: "Oat latte",
        tags: ["food"],
      }),
    ]);
    expect(hits[0]?.memory.id).toBe("tool");
    expect(hits[0]?.reason).toContain("tooling");
  });
});
