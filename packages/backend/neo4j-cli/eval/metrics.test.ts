import { describe, expect, it } from "vitest";
import { recallAtK, reciprocalRank } from "./metrics";

describe("retrieval eval metrics", () => {
  it("scores full recall when every expected title is in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "E"], 5)).toBe(1);
  });

  it("scores partial recall when only some expected titles appear in the top five", () => {
    const titles = ["A", "B", "C", "D", "E", "F"];
    expect(recallAtK(titles, ["B", "Z"], 5)).toBe(0.5);
  });

  it("scores zero recall when no expected titles appear in the top five", () => {
    const titles = ["A", "B", "C", "D", "E"];
    expect(recallAtK(titles, ["Z"], 5)).toBe(0);
  });

  it("scores reciprocal rank from the first relevant hit", () => {
    expect(reciprocalRank(["noise", "target", "other"], ["target"])).toBe(0.5);
    expect(reciprocalRank(["noise", "other"], ["target"])).toBe(0);
    expect(reciprocalRank(["target"], ["target"])).toBe(1);
  });
});
