import { describe, expect, it } from "vitest";
import { computeContentHash } from "../../engine/memory/hash";
import {
  summarizeRetrievedMemories,
  toMemoryCandidate,
} from "../../engine/memory/retrieve";
import type { MemoryWithTags } from "@vmem/sdk";

describe("computeContentHash", () => {
  it("is stable for equivalent whitespace and case", () => {
    const a = computeContentHash("Prefers pnpm", "Use pnpm for vmem");
    const b = computeContentHash(" prefers  PNPM ", "Use   pnpm for vmem");
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it("changes when title or content changes", () => {
    const base = computeContentHash("Prefers pnpm", "Use pnpm for vmem");
    expect(computeContentHash("Prefers npm", "Use pnpm for vmem")).not.toBe(
      base,
    );
    expect(computeContentHash("Prefers pnpm", "Use npm for vmem")).not.toBe(
      base,
    );
  });
});

describe("toMemoryCandidate", () => {
  const memory: MemoryWithTags = {
    id: "mem_1",
    userId: "user_a",
    profileId: "profile_a",
    title: "Prefers pnpm",
    content: "Use pnpm for vmem",
    type: "knowledge",
    source: "api",
    sourceType: null,
    sourceId: null,
    sourceUrl: null,
    sourceSyncedAt: null,
    confidence: 0.9,
    status: "active",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    expiresAt: null,
    tags: ["tooling"],
  };

  it("scores substring matches in title or content", () => {
    const hit = toMemoryCandidate(memory, "pnpm");
    expect(hit.trace.score).toBe(1);
    expect(hit.trace.scoreBreakdown.fulltext).toBe(1);
    expect(hit.trace.reason).toContain("substring");
  });

  it("scores zero when the query is absent", () => {
    const miss = toMemoryCandidate(memory, "webpack");
    expect(miss.trace.score).toBe(0);
    expect(miss.trace.scoreBreakdown.vector).toBe(0);
  });
});

describe("summarizeRetrievedMemories", () => {
  it("joins titles and handles an empty list", () => {
    expect(summarizeRetrievedMemories([])).toBe("No relevant memories found.");
    expect(
      summarizeRetrievedMemories([
        { title: "Prefers pnpm" },
        { title: "Uses Convex" },
      ]),
    ).toBe("Prefers pnpm; Uses Convex");
  });
});
