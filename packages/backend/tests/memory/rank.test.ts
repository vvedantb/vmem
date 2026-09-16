import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import { relatedMemories, rankMemories } from "../../engine/memory/rank";
import {
  retrieveMemoriesFromPool,
  toMemoryCandidate,
} from "../../engine/memory/retrieve";

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

  it("lifts a stored 1-hop neighbor that does not mention the query", () => {
    const bridge = memory({
      id: "mem_bridge",
      title: "the Helios incident was escalated to platform on-call",
      content:
        "When Helios went down the incident was escalated to platform on-call.",
    });
    const gold = memory({
      id: "mem_gold",
      title: "Dana carries the platform pager",
      content: "Dana is first to acknowledge platform pages.",
    });
    const withoutGraph = rankMemories(
      [bridge, gold, coffee],
      "who responded to the Helios incident",
      { limit: 5, legs: { graph: false } },
    );
    const withGraph = rankMemories(
      [bridge, gold, coffee],
      "who responded to the Helios incident",
      {
        limit: 5,
        links: [
          {
            sourceId: "mem_bridge",
            targetId: "mem_gold",
            reason: "platform on-call owns Helios",
          },
        ],
      },
    );
    expect(withoutGraph.map((hit) => hit.id)).not.toContain("mem_gold");
    expect(withGraph.map((hit) => hit.id)).toContain("mem_gold");
    expect(
      withGraph.find((hit) => hit.id === "mem_gold")?.trace.reason,
    ).toContain("related via stored link");
  });

  it("ranks a prefer-title over a recency trap that shares one token", () => {
    const prefer = memory({
      id: "mem_prefer",
      title: "Prefers morning workouts",
      content: "Trains in the morning before work.",
    });
    const trap = memory({
      id: "mem_trap",
      title: "Error E2002 means the request timed out",
      content:
        "When the service returns E2002, it indicates that the request timed out.",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const ranked = rankMemories(
      [trap, prefer],
      "when do I prefer to work out",
      {
        limit: 2,
        nowMs: Date.parse("2026-09-16T00:00:00.000Z"),
      },
    );
    expect(ranked[0]?.id).toBe("mem_prefer");
  });
});

describe("retrieveMemoriesFromPool", () => {
  const profile = memory({
    id: "mem_profile",
    title: "Lives in London",
    content: "Based in London, UK.",
    type: "profile",
    tags: ["city"],
  });
  const knowledge = memory({
    id: "mem_knowledge",
    title: "Prefers pnpm",
    content: "Use pnpm for vmem",
    type: "knowledge",
    tags: ["pnpm"],
  });
  const episodic = memory({
    id: "mem_episodic",
    title: "Met Alice",
    content: "Coffee with Alice",
    type: "episodic",
    tags: ["people"],
  });
  const extraPnpm = memory({
    id: "mem_pnpm_profile",
    title: "Uses pnpm at work",
    content: "Package installs use pnpm.",
    type: "profile",
    tags: ["PNPM"],
  });

  it("applies type so profile retrieve cannot return knowledge or episodic", () => {
    const ranked = retrieveMemoriesFromPool(
      [knowledge, profile, episodic],
      "",
      { type: "profile", limit: 10 },
    );
    expect(ranked.map((hit) => hit.id)).toEqual(["mem_profile"]);
    expect(ranked.every((hit) => hit.type === "profile")).toBe(true);
  });

  it("narrows tags including unsanitized filter values", () => {
    const ranked = retrieveMemoriesFromPool(
      [knowledge, profile, episodic, extraPnpm],
      "",
      { tags: ["PNPM"], limit: 10 },
    );
    expect(ranked.map((hit) => hit.id).sort()).toEqual([
      "mem_knowledge",
      "mem_pnpm_profile",
    ]);
  });

  it("hides suppressed rows unless status is requested", () => {
    const hidden = memory({
      id: "mem_hidden",
      title: "Prefers pnpm",
      content: "Use pnpm",
      tags: ["pnpm"],
      status: "suppressed",
    });
    expect(
      retrieveMemoriesFromPool([knowledge, hidden], "pnpm").map(
        (hit) => hit.id,
      ),
    ).toEqual(["mem_knowledge"]);
    expect(
      retrieveMemoriesFromPool([knowledge, hidden], "pnpm", {
        status: "suppressed",
      }).map((hit) => hit.id),
    ).toEqual(["mem_hidden"]);
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
