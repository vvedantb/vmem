import { describe, expect, it } from "vitest";
import { plainTitle, topicTitle } from "../../eval/frontiermemory/text";

describe("topicTitle", () => {
  it.each([
    ["Fix the date parser. It drops the timezone.", "Fix the date parser"],
    // A JSON grid before the real sentence is skipped.
    [
      "[[7, 7, 0], [1, 2, 7]]\n\nFind the rule that maps each input grid to its output grid.",
      "Find the rule that maps each input grid to its output grid",
    ],
    ['{"input": [1, 2]} Sort the list in place.', "Sort the list in place"],
    [
      "## Goal\n\nUse `pandas` to merge **sales.csv** with [the rates](https://example.com/r).\n```python\nimport pandas\n```",
      "Use pandas to merge sales.csv with the rates",
    ],
    [
      "Determine all functions $f(x)$ such that the sum is even.",
      "Determine all functions such that the sum is even",
    ],
    [
      "you are given   a log\nfile with several errors (and warnings) to triage.",
      "You are given a log file with several errors to triage",
    ],
    [
      "Compute the weekly totals for every warehouse region and then report the largest change",
      "Compute the weekly totals for every warehouse region and…",
    ],
    [
      "Can you please add a retry flag to the upload command?",
      "Add a retry flag to the upload command",
    ],
    ["[[1, 2], [3, 4]]", ""],
    ["", ""],
  ])("%j -> %j", (input, expected) => {
    const title = topicTitle(input);
    expect(title).toBe(expected);
    expect(title.length).toBeLessThanOrEqual(60);
  });
});

describe("plainTitle", () => {
  it.each([
    ["Word2Vec corpus build", "Word2Vec corpus build"],
    ["  Changelog entries, newest first. ", "Changelog entries, newest first"],
    ["[[7, 7, 7]]", null],
    ['{"title": "x"}', null],
    ["Run `make test`", null],
    ["Parser (dates)", null],
    ["12", null],
    [
      "A very long title that goes on and on past the sixty character cap",
      null,
    ],
  ])("%j -> %j", (input, expected) => {
    expect(plainTitle(input)).toBe(expected);
  });
});
