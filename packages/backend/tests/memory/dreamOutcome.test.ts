import { describe, expect, it } from "vitest";
import { memoryOutcome } from "../../engine/memory/dream/outcome";

function outcome(content: string, tags: string[] = [], title = "Note") {
  return memoryOutcome({ title, content, tags });
}

describe("memoryOutcome", () => {
  it("reads outcome tags first, with or without a prefix", () => {
    expect(outcome("Deploy notes", ["success"])).toBe("worked");
    expect(outcome("Deploy notes", ["outcome:fail"])).toBe("failed");
    expect(outcome("Deploy notes", ["status:PASS", "reverted"])).toBe("mixed");
    // a tag beats the text
    expect(outcome("The build failed twice.", ["fixed"])).toBe("worked");
  });

  it.each([
    ["Verifier: PASS", "worked"],
    ["Ran the migration and it worked.", "worked"],
    ["All tests passed after the pin.", "worked"],
    ["Verifier: FAIL", "failed"],
    ["The deploy failed with a timeout.", "failed"],
    ["Error: module not found", "failed"],
    ["We reverted the schema change.", "failed"],
    ["That did not work on Windows.", "failed"],
    ["Bumping the lockfile failed; pinning the version worked.", "mixed"],
  ])("reads %j as %s", (content, expected) => {
    expect(outcome(content)).toBe(expected);
  });

  it.each([
    "Prefers dark mode in every editor.",
    "I worked on the billing page today.",
    "Pass the --profile flag to the CLI.",
    "Handle errors in the retry loop.",
    "",
  ])("finds no signal in %j", (content) => {
    expect(outcome(content)).toBeNull();
  });
});
