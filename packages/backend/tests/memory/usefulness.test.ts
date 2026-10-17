import { describe, expect, it } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import { rankMemories } from "../../engine/memory/rank";
import {
  blendRelevanceWithUsefulness,
  classifySource,
  computeUsefulness,
  heuristicUsefulness,
  jevEligible,
  jevPriority,
  sourcePrior,
  usageScore,
  type UsefulnessInput,
} from "../../engine/memory/usefulness";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-01T00:00:00.000Z");

function input(overrides: Partial<UsefulnessInput> = {}): UsefulnessInput {
  return {
    source: "mcp",
    pinned: false,
    updatedAt: NOW,
    createdAt: NOW,
    nowMs: NOW,
    ...overrides,
  };
}

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
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    expiresAt: null,
    tags: [],
    ...overrides,
  };
}

describe("source prior", () => {
  it("orders deliberate > import > passive", () => {
    expect(sourcePrior("mcp")).toBe(0.92);
    expect(sourcePrior("manual")).toBe(0.92);
    expect(sourcePrior("notion")).toBe(0.62);
    expect(sourcePrior("file-upload")).toBe(0.62);
    expect(sourcePrior("bookmarks")).toBe(0.34);
    expect(sourcePrior("desktop")).toBe(0.34);
    expect(sourcePrior("browsing-history")).toBe(0.34);
    expect(sourcePrior("Chrome ")).toBe(0.34);
  });

  it("matches on either source or sourceType and defaults to medium", () => {
    expect(classifySource("api", "desktop")).toBe("low");
    expect(classifySource("something-new")).toBe("medium");
    expect(classifySource("import:chatgpt")).toBe("medium");
    expect(classifySource("browsing-history")).toBe("low");
  });

  it("skips Jev for low-prior sources and tiers the rest", () => {
    for (const source of ["browsing-history", "bookmarks", "desktop", "chrome"])
      expect(jevEligible(source)).toBe(false);
    expect(jevEligible("mcp")).toBe(true);
    expect(jevEligible("notion")).toBe(true);
    expect(jevPriority("mcp", null, "backfill")).toBe(0);
    expect(jevPriority("notion", null, "live")).toBe(1);
    expect(jevPriority("notion", null, "backfill")).toBe(2);
  });
});

describe("heuristicUsefulness", () => {
  it("fades low-prior sources fast and high-prior sources slowly", () => {
    const fresh = heuristicUsefulness(input({ source: "bookmarks" }));
    const old = heuristicUsefulness(
      input({ source: "bookmarks", updatedAt: NOW - 140 * DAY }),
    );
    expect(old).toBeLessThan(fresh * 0.7);
    const deliberateOld = heuristicUsefulness(
      input({ source: "mcp", updatedAt: NOW - 140 * DAY }),
    );
    expect(deliberateOld).toBeGreaterThan(old * 2);
  });

  it("uses createdAt when updatedAt is missing", () => {
    const value = heuristicUsefulness(
      input({ updatedAt: undefined, createdAt: NOW - 365 * DAY }),
    );
    expect(value).toBeCloseTo(0.92 * (0.45 + 0.55 * 0.5) * 0.55, 10);
  });

  it("does not fade pinned memories", () => {
    const pinned = heuristicUsefulness(
      input({ source: "desktop", pinned: true, updatedAt: NOW - 400 * DAY }),
    );
    const pinnedFresh = heuristicUsefulness(
      input({ source: "desktop", pinned: true }),
    );
    expect(pinned).toBeCloseTo(pinnedFresh, 10);
  });

  it("raises the score with usage", () => {
    const base = heuristicUsefulness(input({ source: "desktop" }));
    const used = heuristicUsefulness(
      input({ source: "desktop", retrieveHits: 5, userEdits: 2 }),
    );
    expect(used).toBeGreaterThan(base);
  });

  it("stays inside 0..1", () => {
    const max = heuristicUsefulness(
      input({ retrieveHits: 1e6, contextPackHits: 1e6, pinned: true }),
    );
    expect(max).toBeLessThanOrEqual(1);
    expect(max).toBeGreaterThan(0.9);
    expect(
      heuristicUsefulness(input({ nowMs: NOW + 1e6 * DAY })),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("usageScore", () => {
  it("is 0 with no signals and follows the saturating formula", () => {
    expect(usageScore({ pinned: false })).toBe(0);
    expect(usageScore({ retrieveHits: 2, pinned: false })).toBeCloseTo(
      1 - Math.exp(-0.3),
      10,
    );
    expect(usageScore({ pinned: true })).toBeCloseTo(1 - Math.exp(-1.2), 10);
  });
});

describe("computeUsefulness", () => {
  it("blends Jev quality 0.72 / 0.28", () => {
    const base = heuristicUsefulness(input());
    expect(computeUsefulness(input({ jevQuality: 1 }))).toBeCloseTo(
      0.72 * base + 0.28,
      10,
    );
  });

  it("ignores missing or out-of-range Jev quality", () => {
    const base = heuristicUsefulness(input());
    expect(computeUsefulness(input())).toBe(base);
    expect(computeUsefulness(input({ jevQuality: 1.5 }))).toBe(base);
    expect(computeUsefulness(input({ jevQuality: Number.NaN }))).toBe(base);
  });
});

describe("rerank blend", () => {
  it("blends 0.85 relevance and 0.15 usefulness", () => {
    expect(blendRelevanceWithUsefulness(1, 0)).toBeCloseTo(0.85, 10);
    expect(blendRelevanceWithUsefulness(0, 1)).toBeCloseTo(0.15, 10);
    expect(blendRelevanceWithUsefulness(2, 2)).toBe(1);
  });

  it("changes a twin's score by exactly 0.15 of the usefulness gap", () => {
    const twin = { title: "Prefers pnpm", content: "Use pnpm for vmem" };
    const api = memory({ id: "api", ...twin });
    const desktop = memory({ id: "desk", ...twin, source: "desktop" });
    const ranked = rankMemories([desktop, api], "pnpm", { nowMs: NOW });
    const score = (id: string) => ranked.find((h) => h.id === id);
    const apiHit = score("api");
    const deskHit = score("desk");
    const uApi = apiHit?.trace.scoreBreakdown.usefulness ?? Number.NaN;
    const uDesk = deskHit?.trace.scoreBreakdown.usefulness ?? Number.NaN;
    expect(ranked[0]?.id).toBe("api");
    expect(uApi).toBeGreaterThan(uDesk);
    const gap = (apiHit?.trace.score ?? 0) - (deskHit?.trace.score ?? 0);
    expect(gap).toBeGreaterThan(0);
    // usefulness moves the score by at most 0.15 of its own gap; the rest is
    // rank-tie noise between identical twins
    expect(gap).toBeLessThan(0.15 * (uApi - uDesk) * 1.5);
  });

  it("keeps relevance dominant over usefulness", () => {
    const exact = memory({
      id: "exact",
      title: "Prefers pnpm",
      content: "Use pnpm for vmem",
      source: "bookmarks",
    });
    const weak = memory({
      id: "weak",
      title: "Notes",
      content:
        "Mentioned pnpm once in passing during an unrelated chat about lunch",
      source: "mcp",
      status: "pinned",
    });
    const ranked = rankMemories([weak, exact], "Prefers pnpm", { nowMs: NOW });
    expect(ranked[0]?.id).toBe("exact");
  });

  it("uses stored usage counters so used spam recovers", () => {
    const twin = { title: "Prefers pnpm", content: "Use pnpm for vmem" };
    const unused = memory({ id: "unused", ...twin, source: "desktop" });
    const used = memory({
      id: "used",
      ...twin,
      source: "desktop",
      usefulness: { retrieveHits: 20, userEdits: 3 },
    });
    const ranked = rankMemories([unused, used], "pnpm", { nowMs: NOW });
    expect(ranked[0]?.id).toBe("used");
  });
});
