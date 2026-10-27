import { describe, expect, it } from "vitest";
import {
  chooseKeeper,
  mergeKeeperPatch,
  mergeLoserPatch,
  resolvePinnedKeeper,
  restorePatch,
  snapshotRow,
  type MergeRow,
} from "../../engine/memory/dream/merge";

type Row = MergeRow<string, string>;

function row(id: string, fields: Partial<Row> = {}): Row {
  return {
    _id: id,
    status: "active",
    createdAt: 100,
    content: "content",
    source: "mcp",
    visitCount: 1,
    firstVisitAt: 100,
    lastVisitAt: 100,
    tags: [],
    ...fields,
  };
}

describe("chooseKeeper", () => {
  it("picks the oldest row, then the longest content", () => {
    const old = row("b", { createdAt: 1 });
    expect(chooseKeeper([row("a", { createdAt: 2 }), old])).toBe(old);
    const long = row("b", { content: "longer content" });
    expect(chooseKeeper([row("a"), long])).toBe(long);
  });

  it("prefers a pinned row and skips a group with two pinned rows", () => {
    const pinned = row("new", { createdAt: 9, status: "pinned" });
    expect(chooseKeeper([row("old", { createdAt: 1 }), pinned])).toBe(pinned);
    expect(
      chooseKeeper([pinned, row("other", { status: "pinned" })]),
    ).toBeNull();
  });
});

describe("resolvePinnedKeeper", () => {
  it("swaps a pinned loser in as the keeper", () => {
    const keeper = row("k");
    const pinned = row("p", { status: "pinned" });
    const other = row("o");
    expect(resolvePinnedKeeper(keeper, [pinned, other])).toEqual({
      keeper: pinned,
      losers: [keeper, other],
    });
    expect(
      resolvePinnedKeeper(pinned, [row("q", { status: "pinned" })]),
    ).toBeNull();
  });
});

describe("mergeKeeperPatch", () => {
  it("sums visits, widens the visit range and joins tags and sources", () => {
    const keeper = row("k", {
      visitCount: 2,
      firstVisitAt: 50,
      lastVisitAt: 60,
      tags: ["a"],
      url: "https://old.test",
      sourceId: "old-key",
    });
    const loser = row("l", {
      visitCount: 3,
      firstVisitAt: 10,
      lastVisitAt: 90,
      tags: ["a", "b"],
      source: "browsing-history",
      sources: ["browsing-history", "extension"],
      url: "https://new.test",
    });
    expect(mergeKeeperPatch(keeper, [loser], "browse-key")).toEqual({
      visitCount: 5,
      firstVisitAt: 10,
      lastVisitAt: 90,
      tags: ["a", "b"],
      sources: ["mcp", "browsing-history", "extension"],
      url: "https://new.test",
      sourceId: "browse-key",
    });
    expect(mergeKeeperPatch(keeper, [loser]).sourceId).toBe("old-key");
  });

  it("caps sources at 10", () => {
    const losers = Array.from({ length: 12 }, (_, i) =>
      row(`l${String(i)}`, { source: `s${String(i)}` }),
    );
    expect(mergeKeeperPatch(row("k"), losers).sources).toHaveLength(10);
  });
});

describe("snapshot and restore", () => {
  it("restores every field and clears fields the row did not have", () => {
    const original = row("l", { tags: ["a"], url: "https://a.test" });
    const snapshot = snapshotRow(original);
    // a stored snapshot drops undefined fields
    const {
      mergedInto: _mergedInto,
      suppressedBy: _suppressedBy,
      suppressedRunId: _suppressedRunId,
      suppressedAt: _suppressedAt,
      ...stored
    } = snapshot;
    const patch = restorePatch(stored);
    expect(Object.keys(patch)).toEqual(
      expect.arrayContaining([
        "mergedInto",
        "suppressedBy",
        "suppressedRunId",
        "suppressedAt",
      ]),
    );
    const merged = {
      ...original,
      ...mergeLoserPatch("k", "run", "dream", 1),
    };
    const restored = { ...merged, ...patch };
    expect(snapshotRow(restored)).toEqual(snapshot);
  });

  it("writes the text back only when the snapshot has it", () => {
    const plain = restorePatch(snapshotRow(row("k")));
    expect(plain).not.toHaveProperty("title");
    expect(plain).not.toHaveProperty("content");
    expect(plain).not.toHaveProperty("contentHash");

    const rewritten = restorePatch({
      ...snapshotRow(row("k")),
      title: "Old title",
      content: "old content",
      contentHash: "old-hash",
    });
    expect(rewritten).toMatchObject({
      title: "Old title",
      content: "old content",
      contentHash: "old-hash",
    });
  });
});
