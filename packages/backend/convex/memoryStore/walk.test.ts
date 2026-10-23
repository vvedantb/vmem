import { describe, expect, it } from "vitest";
import { walkGraphRowsPaged, type GraphRowsLoad } from "./walk";

// `total` numbered rows behind a cursor that is the next row index. Like
// Convex, only a short page is done. The first call of each cursor in
// `splitAt` answers SplitRequired.
function fakeRows(total: number, splitAt: ReadonlySet<string> = new Set()) {
  const split = new Set(splitAt);
  let calls = 0;
  const load: GraphRowsLoad<number> = async ({ cursor, numItems }) => {
    calls += 1;
    const key = cursor ?? "0";
    if (split.delete(key)) {
      return {
        rows: [],
        isDone: false,
        continueCursor: key,
        pageStatus: "SplitRequired",
      };
    }
    const from = Number(key);
    const to = Math.min(total, from + numItems);
    const rows = Array.from({ length: to - from }, (_, i) => from + i);
    return { rows, isDone: to - from < numItems, continueCursor: String(to) };
  };
  return { load, calls: () => calls };
}

async function walk(
  total: number,
  budget: { maxPages: number; pageSize: number },
) {
  const { load } = fakeRows(total);
  const seen: number[] = [];
  const truncated = await walkGraphRowsPaged(
    load,
    (rows) => {
      seen.push(...rows);
    },
    budget,
  );
  return { seen, truncated };
}

describe("walkGraphRowsPaged", () => {
  it("reads past 50 pages when the budget allows", async () => {
    const result = await walk(1_234, { maxPages: 2_000, pageSize: 10 });
    expect(result.seen).toHaveLength(1_234);
    expect(new Set(result.seen).size).toBe(1_234);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation when the page budget runs out first", async () => {
    const result = await walk(1_234, { maxPages: 50, pageSize: 10 });
    expect(result.seen).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("is not truncated when the last page uses the last of the budget", async () => {
    const result = await walk(500, { maxPages: 50, pageSize: 10 });
    expect(result.seen).toHaveLength(500);
    expect(result.truncated).toBe(false);
  });

  it("stops without truncation when onRows returns false", async () => {
    const { load, calls } = fakeRows(1_000);
    const truncated = await walkGraphRowsPaged(load, () => false, {
      maxPages: 50,
      pageSize: 10,
    });
    expect(truncated).toBe(false);
    expect(calls()).toBe(1);
  });

  it("halves the page on SplitRequired and still reads every row", async () => {
    const { load } = fakeRows(100, new Set(["0", "40"]));
    const seen: number[] = [];
    const truncated = await walkGraphRowsPaged(
      load,
      (rows) => {
        seen.push(...rows);
      },
      { maxPages: 2_000, pageSize: 20 },
    );
    expect(seen).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(truncated).toBe(false);
  });
});
