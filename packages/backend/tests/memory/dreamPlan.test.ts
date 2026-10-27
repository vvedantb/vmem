import { describe, expect, it, vi } from "vitest";
import type { SystemOneResponse } from "../../engine/llm/systemOneClient";
import {
  judgeDuplicateGroup,
  parseJevDuplicateVerdict,
  type JevGroupMember,
} from "../../engine/memory/dream/jevDuplicate";
import {
  aiEligibleRows,
  buildCandidateGroups,
  buildDeterministicGroups,
  deterministicStats,
  entityEdges,
  pickCandidateGroups,
  reusePriorVerdicts,
  sourceKeyOf,
  type PlanRow,
} from "../../engine/memory/dream/plan";

type Row = PlanRow<string>;

function row(id: string, fields: Partial<Row> = {}): Row {
  return {
    _id: id,
    memoryId: `m_${id}`,
    title: `Title ${id}`,
    contentLength: 10,
    contentHash: `hash_${id}`,
    source: "mcp",
    status: "active",
    createdAt: 100,
    ...fields,
  };
}

const VHUB_TITLE = "vhub — your own hub for mcp connections and agent secrets";
const VHUB_PATHS = [
  "/",
  "/connectors",
  "/connectors?view=mine",
  "/connectors?category=Notes",
  "/connectors?category=Communication",
  "/connectors?category=Health",
  "/connectors?category=Productivity",
  "/connectors?category=Code",
];

function vhubRows(): Row[] {
  return VHUB_PATHS.map((path, i) =>
    row(`v${String(i)}`, {
      title: VHUB_TITLE,
      url: `https://vhub.projectv.uk${path}`,
      source: "browsing-history",
      sourceType: "browsing-history",
      createdAt: 100 + i,
    }),
  );
}

describe("buildDeterministicGroups", () => {
  it("collapses the vhub pattern (8 urls, one title) into one key group", () => {
    const groups = buildDeterministicGroups(vhubRows());
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      rules: ["key"],
      keeperId: "v0",
      sourceKey: `vhub.projectv.uk|${VHUB_TITLE.toLowerCase()}`,
    });
    expect(groups[0]?.loserIds).toHaveLength(7);
  });

  it("groups an exact trio and keeps the oldest", () => {
    const groups = buildDeterministicGroups([
      row("a", { contentHash: "h", createdAt: 3 }),
      row("b", { contentHash: "h", createdAt: 1 }),
      row("c", { contentHash: "h", createdAt: 2 }),
      row("d"),
    ]);
    expect(groups).toEqual([
      expect.objectContaining({
        rules: ["exact"],
        keeperId: "b",
        loserIds: ["c", "a"],
      }),
    ]);
  });

  it("never makes a pinned row a loser", () => {
    const groups = buildDeterministicGroups([
      row("old", { contentHash: "h", createdAt: 1 }),
      row("pin", { contentHash: "h", createdAt: 5, status: "pinned" }),
      row("pin2", { contentHash: "h", createdAt: 6, status: "pinned" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.keeperId).toBe("pin");
    expect(groups[0]?.loserIds).toEqual(["old"]);
  });

  it("unions overlapping exact and key buckets into one group", () => {
    const browsing = {
      source: "browsing-history",
      title: "Docs",
    } satisfies Partial<Row>;
    const groups = buildDeterministicGroups([
      row("a", { ...browsing, url: "https://x.dev/a", contentHash: "h" }),
      row("b", { ...browsing, url: "https://x.dev/b", contentHash: "h" }),
      row("c", { ...browsing, url: "https://x.dev/c", createdAt: 1 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.rules).toEqual(["exact", "key"]);
    expect(groups[0]?.keeperId).toBe("c");
    expect(deterministicStats(groups)).toEqual({
      exactGroups: 0,
      keyGroups: 0,
      bothGroups: 1,
      groups: 1,
      rowsToSuppress: 2,
    });
  });

  it("keys bookmarks by canonical url and ignores sources without a key", () => {
    expect(
      sourceKeyOf({
        source: "bookmarks",
        title: "A",
        url: "https://www.x.dev/a?utm_source=y#top",
      }),
    ).toBe("bookmark|https://x.dev/a");
    expect(
      sourceKeyOf({ source: "mcp", title: "A", url: "https://x.dev" }),
    ).toBeUndefined();
    expect(
      sourceKeyOf({ source: "browsing-history", title: "A" }),
    ).toBeUndefined();
  });
});

describe("rule J candidates", () => {
  it("drops A/B losers and low-prior sources", () => {
    const rows = [
      row("a", { contentHash: "h", createdAt: 1 }),
      row("b", { contentHash: "h", createdAt: 2 }),
      row("web", { source: "browsing-history" }),
      row("desk", { source: "desktop" }),
      row("note"),
    ];
    const ids = aiEligibleRows(rows, buildDeterministicGroups(rows)).map(
      (r) => r._id,
    );
    expect(ids).toEqual(["a", "note"]);
  });

  it("groups only rows joined by candidate edges", () => {
    const groups = buildCandidateGroups([
      { a: "a", b: "b", score: 0.95 },
      { a: "c", b: "d" },
    ]);
    expect(groups).toEqual([
      { memberIds: ["a", "b"], score: 0.95 },
      { memberIds: ["c", "d"], score: 0 },
    ]);
  });

  it("clusters transitively: A~B and B~C give one group of three", () => {
    const groups = buildCandidateGroups([
      { a: "a", b: "b", score: 0.95 },
      { a: "b", b: "c", score: 0.93 },
    ]);
    expect(groups).toEqual([{ memberIds: ["a", "b", "c"], score: 0.95 }]);
  });

  it("splits a hub larger than six members without gluing its leaves", () => {
    const edges = Array.from({ length: 8 }, (_, i) => ({
      a: "n0",
      b: `n${String(i + 1)}`,
      score: 0.92,
    }));
    const groups = buildCandidateGroups(edges);
    // the hub and five leaves; the other leaves share no edge with each
    // other, so they wait for a later scan instead of forming a group
    expect(groups).toEqual([
      { memberIds: ["n0", "n1", "n2", "n3", "n4", "n5"], score: 0.92 },
    ]);
  });

  it("splits a long chain into connected groups of at most six", () => {
    const ids = Array.from({ length: 14 }, (_, i) => `c${String(i + 10)}`);
    const edges = ids.slice(1).map((b, i) => ({
      a: ids[i] ?? "",
      b,
      score: 0.91,
    }));
    const groups = buildCandidateGroups(edges);
    expect(groups.map((g) => g.memberIds)).toEqual([
      ids.slice(0, 6),
      ids.slice(6, 12),
      ids.slice(12),
    ]);
    const linked = new Set(edges.map((edge) => `${edge.a}|${edge.b}`));
    for (const { memberIds } of groups) {
      // each member links to the one before it inside the same group
      memberIds.slice(1).forEach((id, i) => {
        expect(linked.has(`${memberIds[i] ?? ""}|${id}`)).toBe(true);
      });
    }
  });

  it("skips entities too broad for one group", () => {
    const narrow = ["a", "b"].map((rowId) => ({ rowId, entityId: "e1" }));
    const broad = ["a", "b", "c", "d", "e", "f", "g"].map((rowId) => ({
      rowId,
      entityId: "e2",
    }));
    expect(entityEdges([...narrow, ...broad])).toEqual([{ a: "a", b: "b" }]);
  });

  it("caps picks, optionally as an even spread", () => {
    const all = [1, 2, 3, 4, 5, 6];
    expect(pickCandidateGroups(all, 2, false)).toEqual([1, 2]);
    expect(pickCandidateGroups(all, 2, true)).toEqual([1, 4]);
    expect(pickCandidateGroups(all, 10, true)).toEqual(all);
  });

  it("reuses earlier verdicts for the same member set, in any order", () => {
    const groups = [
      { memberIds: ["a", "b"], score: 0.99 },
      { memberIds: ["c", "d", "e"], score: 0.95 },
      { memberIds: ["f", "g"], score: 0.93 },
      { memberIds: ["h", "i"], score: 0.91 },
      { memberIds: ["j", "k"], score: 0 },
    ];
    const { reused, unjudged } = reusePriorVerdicts(groups, [
      { memberIds: ["b", "a"], aiStatus: "flagged" },
      { memberIds: ["e", "c", "d"], aiStatus: "not_duplicate" },
      // errors and unjudged groups are judged again
      { memberIds: ["f", "g"], aiStatus: "error" },
      { memberIds: ["h", "i"], aiStatus: "pending" },
      // a different member set is a different group
      { memberIds: ["j", "k", "l"], aiStatus: "flagged" },
    ]);
    expect(
      reused.map(({ group, verdict }) => [group.score, verdict.aiStatus]),
    ).toEqual([
      [0.99, "flagged"],
      [0.95, "not_duplicate"],
    ]);
    expect(unjudged.map((group) => group.score)).toEqual([0.93, 0.91, 0]);
  });

  it("hands back a reused cluster verdict whole, merged text included", () => {
    const verdict = {
      memberIds: ["c", "a", "b"],
      aiStatus: "flagged",
      keeperId: "a",
      loserIds: ["b", "c"],
      proposedTitle: "Uses pnpm",
      proposedContent: "Uses pnpm 10 for every repo.",
    };
    const { reused, unjudged } = reusePriorVerdicts(
      [{ memberIds: ["a", "b", "c"], score: 0.97 }],
      [verdict],
    );
    expect(unjudged).toEqual([]);
    expect(reused[0]?.verdict).toBe(verdict);
    // one more member is a new cluster: judged again
    expect(
      reusePriorVerdicts(
        [{ memberIds: ["a", "b", "c", "d"], score: 0.97 }],
        [verdict],
      ).unjudged,
    ).toHaveLength(1);
  });
});

const memberX: JevGroupMember = {
  id: "x",
  title: "A",
  content: "a",
  status: "active",
  createdAt: 1,
};
const memberY: JevGroupMember = { ...memberX, id: "y", createdAt: 2 };
const members = [
  memberX,
  memberY,
  { ...memberX, id: "z", status: "pinned", createdAt: 3 },
] satisfies JevGroupMember[];

function answers(
  overrides: Partial<SystemOneResponse["answers"]> = {},
): SystemOneResponse["answers"] {
  return {
    duplicate: { type: "noul", noul: 0.9 },
    keep: { type: "choice", choice: "m0" },
    reason: { type: "choice", choice: "same_fact" },
    remove_m1: { type: "noul", noul: 0.8 },
    remove_m2: { type: "noul", noul: 0.9 },
    ...overrides,
  };
}

describe("parseJevDuplicateVerdict", () => {
  it("flags removals but never a pinned row", () => {
    expect(parseJevDuplicateVerdict(members, answers())).toEqual({
      status: "flagged",
      keeperId: "x",
      removeIds: ["y"],
      reason: "Same fact stated in different words",
      confidence: 0.9,
    });
  });

  it("ignores remove answers for keys outside the group", () => {
    const verdict = parseJevDuplicateVerdict(
      members,
      answers({
        remove_m1: { type: "noul", noul: 0.1 },
        remove_m9: { type: "noul", noul: 1 },
      }),
    );
    expect(verdict.status).toBe("not_duplicate");
  });

  it("reports malformed answers and keepers outside the group as errors", () => {
    expect(parseJevDuplicateVerdict(members, {}).status).toBe("error");
    expect(
      parseJevDuplicateVerdict(
        members,
        answers({ keep: { type: "choice", choice: "m7" } }),
      ),
    ).toEqual({ status: "error", reason: "keeper not in group" });
    expect(
      parseJevDuplicateVerdict(
        members,
        answers({ duplicate: { type: "noul", noul: 3 } }),
      ).status,
    ).toBe("error");
  });

  it("is not a duplicate below the threshold or for a 'different' reason", () => {
    expect(
      parseJevDuplicateVerdict(
        members,
        answers({ duplicate: { type: "noul", noul: 0.4 } }),
      ).status,
    ).toBe("not_duplicate");
    expect(
      parseJevDuplicateVerdict(
        members,
        answers({ reason: { type: "choice", choice: "different" } }),
      ).status,
    ).toBe("not_duplicate");
  });
});

describe("judgeDuplicateGroup", () => {
  it("sends truncated state and returns usage and cost", async () => {
    const evaluate = vi.fn(async () => ({
      model: "typesafe-ai/jev",
      answers: answers(),
      usage: { input_tokens: 300, output_tokens: 12 },
      costUsd: 0.0002,
    }));
    const result = await judgeDuplicateGroup({
      members: [{ ...memberX, content: "word ".repeat(400) }, memberY],
      apiKey: "key",
      evaluate,
    });
    expect(result).toMatchObject({
      verdict: { status: "flagged", keeperId: "x", removeIds: ["y"] },
      promptTokens: 300,
      costUsd: 0.0002,
    });
    const state = JSON.stringify(evaluate.mock.calls);
    expect(state.length).toBeLessThan(3_000);
  });

  it("turns a failed call into an error verdict", async () => {
    const result = await judgeDuplicateGroup({
      members,
      apiKey: "key",
      evaluate: async () => {
        throw new Error("gateway down");
      },
    });
    expect(result.verdict).toEqual({ status: "error", reason: "gateway down" });
  });
});
