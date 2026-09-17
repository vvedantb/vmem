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

  it("lifts a 2-hop neighbor that does not mention the query", () => {
    const seed = memory({
      id: "mem_seed",
      title: "Quasar persists into Aurora",
      content: "Quasar writes durable state into Aurora every night.",
    });
    const mid = memory({
      id: "mem_mid",
      title: "Aurora paging is owned by the storage team",
      content: "When Aurora pages, the storage rota is the escalation path.",
    });
    const gold = memory({
      id: "mem_gold2",
      title: "Asha is first responder for the rota",
      content: "Asha acknowledges that rota before anyone else on the shift.",
    });
    const links = [
      {
        sourceId: "mem_seed",
        targetId: "mem_mid",
        reason: "Quasar stored in Aurora",
      },
      {
        sourceId: "mem_mid",
        targetId: "mem_gold2",
        reason: "storage on-call for Aurora",
      },
    ];
    const without = rankMemories(
      [seed, mid, gold, coffee],
      "who pages when Quasar storage fails",
      {
        limit: 5,
        legs: { graph: false },
      },
    );
    const withGraph = rankMemories(
      [seed, mid, gold, coffee],
      "who pages when Quasar storage fails",
      { limit: 5, links },
    );
    expect(without.map((hit) => hit.id)).not.toContain("mem_gold2");
    expect(withGraph.map((hit) => hit.id)).toContain("mem_gold2");
    expect(withGraph.findIndex((hit) => hit.id === "mem_gold2")).toBeLessThan(
      3,
    );
  });

  it("prefers a whole-word entity over a camelCase lookalike", () => {
    const helios = memory({
      id: "mem_helios",
      title: "Asha is DRI for Helios",
      content: "Asha owns Helios end to end, including incidents.",
    });
    const heliosRun = memory({
      id: "mem_heliosrun",
      title: "Benno is DRI for HeliosRun",
      content: "HeliosRun is a separate batch pipeline. Benno owns it.",
    });
    const ranked = rankMemories([heliosRun, helios], "who is DRI for Helios", {
      limit: 2,
    });
    expect(ranked[0]?.id).toBe("mem_helios");
  });

  it("does not let a recent keyword trap beat an older gold on a non-temporal query", () => {
    const gold = memory({
      id: "mem_prod",
      title: "Card capture deadline",
      content: "The live payments timeout aborts an auth after two seconds.",
      tags: ["payments", "production"],
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const trap = memory({
      id: "mem_stage",
      title: "Payments timeout tuned last night",
      content: "Timeout for payments is thirty seconds.",
      tags: ["payments", "staging"],
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    const ranked = rankMemories([trap, gold], "production payments timeout", {
      limit: 2,
      nowMs: Date.parse("2026-09-17T00:00:00.000Z"),
    });
    expect(ranked[0]?.id).toBe("mem_prod");
  });

  it("attaches the best matching chunk", () => {
    const ranked = rankMemories(
      [
        memory({
          id: "mem_long",
          title: "Runbook",
          content:
            "Unrelated intro. Vault canary is orange-mule-42 and must stay unique. Trailing noise.",
        }),
      ],
      "vault canary token",
      { limit: 1 },
    );
    expect(ranked[0]?.matchedChunk?.content.toLowerCase()).toContain("canary");
    expect(ranked[0]?.trace.scoreBreakdown.rerankerScore).toBeGreaterThan(0);
  });

  it("boosts event windows over same-age recency for last-week queries", () => {
    const nowMs = Date.parse("2026-09-17T12:00:00.000Z");
    const week = memory({
      id: "mem_week",
      title: "Summit dinner with Alice",
      content: "Sat with Alice at the product summit dinner.",
      type: "episodic",
      eventStart: "2026-09-07T00:00:00.000Z",
      eventEnd: "2026-09-08T00:00:00.000Z",
      temporalKind: "event",
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
    const yday = memory({
      id: "mem_yday",
      title: "Standup with Alice",
      content: "Alice joined the morning standup.",
      type: "episodic",
      eventStart: "2026-09-16T00:00:00.000Z",
      eventEnd: "2026-09-17T00:00:00.000Z",
      temporalKind: "event",
      createdAt: "2026-09-15T00:00:00.000Z",
      updatedAt: "2026-09-15T00:00:00.000Z",
    });
    const ranked = rankMemories([yday, week], "Alice last week", {
      limit: 2,
      nowMs,
    });
    expect(ranked[0]?.id).toBe("mem_week");
    expect(ranked[0]?.trace.scoreBreakdown.temporal).toBeGreaterThan(
      ranked[1]?.trace.scoreBreakdown.temporal ?? 0,
    );
    expect(ranked[0]?.trace.reason).toContain("temporal");
  });

  it("keeps Context Trace legs when optional rerank is on", () => {
    const ranked = rankMemories([pnpm, coffee], "pnpm", {
      limit: 2,
      rerank: true,
    });
    expect(ranked[0]?.id).toBe("mem_pnpm");
    expect(ranked[0]?.trace.scoreBreakdown.fulltext).toBeGreaterThan(0);
    expect(ranked[0]?.trace.scoreBreakdown.rerankerScore).toBeGreaterThan(0);
  });

  it("drops hits below a score threshold", () => {
    const all = rankMemories([pnpm, coffee], "pnpm");
    expect(all.length).toBeGreaterThan(0);
    const floor = (all[0]?.trace.score ?? 0) + 0.01;
    const filtered = rankMemories([pnpm, coffee], "pnpm", {
      threshold: floor,
    });
    expect(filtered).toEqual([]);
  });

  it("ranks a profile live-in fact over office and trip notes", () => {
    const profile = memory({
      id: "mem_live",
      title: "Lives in Lisbon",
      content: "Based in Lisbon, Portugal, near the river.",
      type: "profile",
      tags: ["city"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const office = memory({
      id: "mem_office",
      title: "Lisbon office has twelve desks",
      content: "The Lisbon office is a knowledge note about seating.",
      updatedAt: "2026-09-01T00:00:00.000Z",
    });
    const trip = memory({
      id: "mem_trip",
      title: "Flew to Lisbon last May",
      content: "Weekend trip to Lisbon for a conference.",
      type: "episodic",
      updatedAt: "2026-09-10T00:00:00.000Z",
    });
    const standup = memory({
      id: "mem_standup",
      title: "Prefers async standups over live ones",
      content: "Would rather post a written standup than attend a live call.",
      type: "profile",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });
    const ranked = rankMemories(
      [office, trip, profile, standup],
      "where does the user live",
      { limit: 3, nowMs: Date.parse("2026-09-17T00:00:00.000Z") },
    );
    expect(ranked[0]?.id).toBe("mem_live");
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

  it("applies source so web retrieve cannot return mcp rows", () => {
    const web = memory({
      id: "mem_web",
      title: "Prefers pnpm",
      content: "Use pnpm for vmem",
      source: "web",
    });
    const mcp = memory({
      id: "mem_mcp",
      title: "Prefers pnpm",
      content: "Use pnpm for vmem",
      source: "mcp",
    });
    expect(
      retrieveMemoriesFromPool([web, mcp], "pnpm", { source: "web" }).map(
        (hit) => hit.id,
      ),
    ).toEqual(["mem_web"]);
  });

  it("ranks a unicode token query over an ascii distractor", () => {
    const arabic = memory({
      id: "mem_ar",
      title: "Prefers green tea",
      content: "المستخدم يحب الشاي الأخضر في الصباح",
    });
    const coffee = memory({
      id: "mem_en",
      title: "Coffee order",
      content: "Oat latte every morning",
    });
    expect(
      retrieveMemoriesFromPool([coffee, arabic], "أين الشاي", { limit: 5 }).map(
        (hit) => hit.id,
      ),
    ).toEqual(["mem_ar"]);
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

  it("hides a same-age stale row once it is suppressed", () => {
    const timestamp = "2026-09-01T00:00:00.000Z";
    const stale = memory({
      id: "mem_stale",
      title: "Editor was Vim",
      content: "Historically the editor was Vim.",
      status: "suppressed",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const current = memory({
      id: "mem_current",
      title: "Editor is now Helix",
      content: "As of recently, the editor is Helix; Vim is deprecated.",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const ranked = retrieveMemoriesFromPool(
      [stale, current],
      "what editor currently",
      {
        limit: 5,
      },
    );
    expect(ranked.map((hit) => hit.id)).toEqual(["mem_current"]);
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
