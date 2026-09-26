import { describe, expect, it, vi } from "vitest";
import type { MemoryWithTags } from "@vmem/sdk";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import {
  JEV_BEST_NONE,
  JEV_GATE_HEAD,
  appendJevExplain,
  jevExplain,
} from "../../engine/memory/jevGate";
import {
  buildJevRankQuestions,
  jevRankItems,
  jevRankRelatedMemories,
} from "../../engine/memory/jevRank";
import type { RelatedMemoryHit } from "../../engine/memory/rank";

type Row = { id: string; title: string; excerpt: string };

const alpha: Row = { id: "a", title: "Alpha", excerpt: "Deploy runbook" };
const beta: Row = { id: "b", title: "Beta", excerpt: "Coffee notes" };
const gamma: Row = { id: "c", title: "Gamma", excerpt: "Release checklist" };

function toItem(row: Row): { id: string; title: string; content: string } {
  return { id: row.id, title: row.title, content: row.excerpt };
}

function score(value: number): SystemOneResponse["answers"][string] {
  return {
    type: "score",
    score: value,
    legend: {
      "0": "irrelevant",
      "1": "weakly related",
      "2": "directly answers",
    },
    probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 },
    confidence: 0.8,
  };
}

function response(
  answers: SystemOneResponse["answers"],
  best: string = JEV_BEST_NONE,
): SystemOneResponse {
  return {
    model: "jev-latest",
    answers: {
      ...answers,
      best: {
        type: "choice",
        choice: best,
        probabilities: { [best]: 0.8 },
        confidence: 0.8,
      },
    },
  };
}

function rank(
  rows: readonly Row[],
  evaluate: () => Promise<SystemOneResponse>,
  apiKey: string | undefined,
): ReturnType<typeof jevRankItems<Row>> {
  return jevRankItems({
    query: "how do we ship a release?",
    items: rows,
    toItem,
    subject: "wiki page",
    task: "wiki-search",
    apiKey,
    evaluate,
  });
}

describe("jevExplain", () => {
  it("labels top pick, relevant, and weak matches honestly", () => {
    expect(jevExplain({ jevBest: true, jevRelevant: 0.1 })).toBe(
      "Jev top pick",
    );
    expect(jevExplain({ jevRelevant: 0.66 })).toBe("Jev relevant");
    expect(jevExplain({ jevRelevant: 0.03 })).toBe("Jev weak match");
    expect(jevExplain({ jevScore: 1 })).toBeUndefined();
    expect(jevExplain(undefined)).toBeUndefined();
  });

  it("appends once and leaves the reason alone without a label", () => {
    expect(appendJevExplain("shared tags: a", { jevRelevant: 0.9 })).toBe(
      "shared tags: a; Jev relevant",
    );
    expect(
      appendJevExplain("shared tags: a; Jev relevant", { jevRelevant: 0.9 }),
    ).toBe("shared tags: a; Jev relevant");
    expect(appendJevExplain("shared tags: a", undefined)).toBe(
      "shared tags: a",
    );
  });
});

describe("buildJevRankQuestions", () => {
  it("asks noul + score per item and one best choice", () => {
    const questions = buildJevRankQuestions(
      [toItem(alpha), toItem(beta)],
      "wiki page",
    );
    expect(Object.keys(questions).sort()).toEqual(
      ["best", "rel_0", "rel_1", "sc_0", "sc_1"].sort(),
    );
    expect(questions.best?.type).toBe("choice");
    if (questions.best?.type !== "choice") return;
    expect(Object.keys(questions.best.criteria)).toEqual([
      JEV_BEST_NONE,
      "h0",
      "h1",
    ]);
  });
});

describe("jevRankItems", () => {
  it("reorders by best, then Jev score, then noul, and keeps every item", async () => {
    const evaluate = vi.fn(async () =>
      response(
        {
          rel_0: { type: "noul", noul: 0.4 },
          rel_1: { type: "noul", noul: 0.02 },
          rel_2: { type: "noul", noul: 0.9 },
          sc_0: score(1),
          sc_1: score(0),
          sc_2: score(2),
        },
        "h2",
      ),
    );
    const ranked = await rank([alpha, beta, gamma], evaluate, "test-key");
    expect(evaluate).toHaveBeenCalledOnce();
    expect(ranked.source).toBe("jev");
    expect(ranked.items.map((row) => row.id)).toEqual(["c", "a", "b"]);
    expect(ranked.scores.get("c")).toEqual({
      jevRelevant: 0.9,
      jevScore: 2,
      jevBest: true,
    });
    expect(ranked.scores.get("b")?.jevRelevant).toBe(0.02);
  });

  it("keeps a low-noul item even when best is none", async () => {
    const evaluate = vi.fn(async () =>
      response({
        rel_0: { type: "noul", noul: 0.01 },
        rel_1: { type: "noul", noul: 0.02 },
      }),
    );
    const ranked = await rank([alpha, beta], evaluate, "test-key");
    expect(ranked.items.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("fails open on error, missing key, empty query, and junk answers", async () => {
    const throwing = vi.fn(async () => {
      throw new Error("timeout");
    });
    const errored = await rank([alpha, beta, gamma], throwing, "test-key");
    expect(errored.source).toBe("fail-open");
    expect(errored.items.map((row) => row.id)).toEqual(["a", "b", "c"]);

    const unused = vi.fn(async () => response({}));
    const noKey = await rank([alpha, beta], unused, undefined);
    expect(unused).not.toHaveBeenCalled();
    expect(noKey.items.map((row) => row.id)).toEqual(["a", "b"]);

    const blank = await jevRankItems({
      query: "   ",
      items: [alpha, beta],
      toItem,
      subject: "wiki page",
      task: "wiki-search",
      apiKey: "test-key",
      evaluate: unused,
    });
    expect(unused).not.toHaveBeenCalled();
    expect(blank.items.map((row) => row.id)).toEqual(["a", "b"]);

    const junk = await rank(
      [alpha, beta],
      vi.fn(async () =>
        response({ rel_0: score(2), sc_1: { type: "noul", noul: 1 } }, "h9"),
      ),
      "test-key",
    );
    expect(junk.source).toBe("fail-open");
    expect(junk.items.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("only sends the head to Jev and keeps the tail in order", async () => {
    const rows: Row[] = Array.from({ length: JEV_GATE_HEAD + 3 }, (_, i) => ({
      id: `r${String(i)}`,
      title: `Row ${String(i)}`,
      excerpt: "text",
    }));
    const evaluate = vi.fn(async () =>
      response({ rel_5: { type: "noul", noul: 0.9 } }, "h5"),
    );
    const ranked = await rank(rows, evaluate, "test-key");
    expect(ranked.items).toHaveLength(rows.length);
    expect(ranked.items[0]?.id).toBe("r5");
    expect(ranked.items.slice(-3).map((row) => row.id)).toEqual([
      `r${String(JEV_GATE_HEAD)}`,
      `r${String(JEV_GATE_HEAD + 1)}`,
      `r${String(JEV_GATE_HEAD + 2)}`,
    ]);
  });
});

function memory(id: string, title: string, content: string): MemoryWithTags {
  return {
    id,
    userId: "user_a",
    profileId: "profile_a",
    title,
    content,
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
    tags: ["tooling"],
  };
}

describe("jevRankRelatedMemories", () => {
  const seed = memory("seed", "Uses pnpm", "vmem uses pnpm workspaces");
  const hits: RelatedMemoryHit[] = [
    {
      memory: memory("m_coffee", "Coffee", "Oat latte"),
      reason: "shared tags: tooling",
      score: 0.7,
    },
    {
      memory: memory("m_turbo", "Turbo", "pnpm + turbo build"),
      reason: "shared tags: tooling; similar title or content",
      score: 0.6,
    },
    {
      memory: memory("m_node", "Node 22", "Runtime is Node 22"),
      reason: "shared tags: tooling",
      score: 0.5,
    },
  ];

  it("reranks with the seed as the query, explains, and trims to limit", async () => {
    const evaluate = vi.fn(async () =>
      response(
        {
          rel_0: { type: "noul", noul: 0.05 },
          rel_1: { type: "noul", noul: 0.95 },
          rel_2: { type: "noul", noul: 0.6 },
        },
        "h1",
      ),
    );
    const related = await jevRankRelatedMemories({
      seed,
      hits,
      limit: 2,
      apiKey: "test-key",
      evaluate,
    });
    expect(evaluate).toHaveBeenCalledOnce();
    expect(related.map((row) => row.memory.id)).toEqual(["m_turbo", "m_node"]);
    expect(related[0]?.reason).toBe(
      "shared tags: tooling; similar title or content; Jev top pick",
    );
    expect(related[1]?.reason).toBe("shared tags: tooling; Jev relevant");
  });

  it("returns lexical order and reasons without a key", async () => {
    const related = await jevRankRelatedMemories({
      seed,
      hits,
      limit: 10,
      apiKey: undefined,
    });
    expect(related.map((row) => row.memory.id)).toEqual([
      "m_coffee",
      "m_turbo",
      "m_node",
    ]);
    expect(related.map((row) => row.reason)).toEqual(
      hits.map((hit) => hit.reason),
    );
  });
});
