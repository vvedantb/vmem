import type { MemoryStatus } from "@vmem/sdk";
import { describe, expect, it } from "vitest";
import { applyOpenPairs } from "../../engine/memory/openPairs";
import {
  contentBudget,
  provenanceSuffix,
} from "../../engine/memory/recallLine";
import {
  findNearMatches,
  SUPERSEDE_JACCARD,
  textJaccard,
} from "../../engine/memory/supersede";

describe("provenanceSuffix", () => {
  it("shows the UTC saved date and the source", () => {
    expect(
      provenanceSuffix({
        createdAt: "2026-11-04T23:30:00.000-02:00",
        source: "cursor",
      }),
    ).toBe(" (saved 2026-11-05, via cursor)");
  });

  it("clips a long source and lists at most two conflict ids", () => {
    expect(
      provenanceSuffix({
        createdAt: "2026-01-02T00:00:00.000Z",
        source: "a-very-long-connector-source-name",
        conflictsWith: ["m1", "m2", "m3"],
      }),
    ).toBe(
      " (saved 2026-01-02, via a-very-long-connector-s…, may conflict with m1, m2)",
    );
  });

  it("leaves out unknown parts", () => {
    expect(provenanceSuffix({ createdAt: "not a date", source: "mcp" })).toBe(
      " (via mcp)",
    );
    expect(provenanceSuffix({ createdAt: "", source: "  " })).toBe("");
  });

  it("takes the suffix out of the content budget, with a floor", () => {
    expect(contentBudget(300, " (saved 2026-01-02, via mcp)")).toBe(272);
    expect(contentBudget(300, "x".repeat(400))).toBe(75);
  });
});

describe("applyOpenPairs", () => {
  const row = (id: string, createdAt: string) => ({ id, createdAt });
  const older = row("old", "2026-01-01T00:00:00.000Z");
  const newer = row("new", "2026-02-01T00:00:00.000Z");
  const other = row("other", "2026-01-15T00:00:00.000Z");

  it("drops the older row of an open near-dup pair, in either order", () => {
    for (const memories of [
      [older, newer, other],
      [newer, older, other],
    ]) {
      const result = applyOpenPairs(memories, [
        { a: "old", b: "new", kind: "near_dup" },
      ]);
      expect(result.memories.map((memory) => memory.id)).toEqual(
        memories.filter((memory) => memory.id !== "old").map((m) => m.id),
      );
      expect(result.hidden).toEqual([{ id: "old", keptId: "new" }]);
    }
  });

  it("marks both rows of an open maybe-conflict pair", () => {
    const result = applyOpenPairs(
      [older, newer, other],
      [{ a: "new", b: "old", kind: "maybe_conflict" }],
    );
    expect(result.hidden).toEqual([]);
    expect(result.memories).toEqual([
      { ...older, conflictsWith: ["new"] },
      { ...newer, conflictsWith: ["old"] },
      other,
    ]);
  });

  it("ignores pairs with a row outside the set, and keeps the top rank on a tie", () => {
    const tied = row("tied", newer.createdAt);
    const result = applyOpenPairs(
      [newer, tied],
      [
        { a: "new", b: "missing", kind: "near_dup" },
        { a: "tied", b: "new", kind: "near_dup" },
      ],
    );
    expect(result.memories.map((memory) => memory.id)).toEqual(["new"]);
    expect(result.hidden).toEqual([{ id: "tied", keptId: "new" }]);
  });

  it("drops every older row of a chain and no conflict points at a hidden row", () => {
    const newest = row("newest", "2026-03-01T00:00:00.000Z");
    const result = applyOpenPairs(
      [older, newer, newest, other],
      [
        { a: "old", b: "new", kind: "near_dup" },
        { a: "new", b: "newest", kind: "near_dup" },
        { a: "old", b: "other", kind: "maybe_conflict" },
      ],
    );
    expect(result.memories).toEqual([newest, other]);
    expect(result.hidden.map((entry) => entry.id).sort()).toEqual([
      "new",
      "old",
    ]);
  });
});

describe("findNearMatches", () => {
  const memory = (
    id: string,
    title: string,
    content: string,
    status: MemoryStatus = "active",
  ) => ({
    id,
    title,
    content,
    status,
  });

  it("keeps visible rows at the supersede threshold, best first", () => {
    const probe = {
      title: "Deploy target",
      content: "Production deploys go to Vercel from main",
    };
    const close = memory(
      "close",
      "Deploy target",
      "Production deploys go to Heroku from main",
    );
    const same = memory(
      "same",
      "Deploy target",
      "Production deploys go to Vercel from main branch",
    );
    const hidden = memory(
      "hidden",
      "Deploy target",
      "Production deploys go to Vercel from main",
      "suppressed",
    );
    const unrelated = memory("coffee", "Coffee", "Oat latte every morning");
    expect(textJaccard(probe, close)).toBeGreaterThanOrEqual(SUPERSEDE_JACCARD);
    expect(
      findNearMatches(probe, [unrelated, close, hidden, same]).map(
        (match) => match.id,
      ),
    ).toEqual(["same", "close"]);
  });

  it("caps the list", () => {
    const probe = { title: "Tea", content: "Likes green tea" };
    const rows = Array.from({ length: 8 }, (_, index) =>
      memory(`m${String(index)}`, "Tea", "Likes green tea"),
    );
    expect(findNearMatches(probe, rows)).toHaveLength(5);
    expect(findNearMatches(probe, rows, 2)).toHaveLength(2);
  });
});
