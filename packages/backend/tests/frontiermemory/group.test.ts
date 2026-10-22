import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { groupRuns, matchTask } from "../../eval/frontiermemory/group";
import { normalizeTrajectory } from "../../eval/frontiermemory/normalize";
import { DEFAULT_TASKS_PATH } from "../../eval/frontiermemory/pipeline";
import { taskSpecSchema } from "../../eval/frontiermemory/types";
import type { NormalizedRun } from "../../eval/frontiermemory/types";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const tasks = taskSpecSchema
  .array()
  .parse(JSON.parse(readFileSync(DEFAULT_TASKS_PATH, "utf8")));

function run(file: string, taskPrompt: string): NormalizedRun {
  return {
    file,
    hash: file,
    format: "generic",
    taskPrompt,
    userFeedback: [],
    finalAssistant: [],
    outcome: "UNKNOWN",
    orderHint: null,
    approxTokens: 0,
  };
}

describe("matchTask", () => {
  it("matches prompts to public tasks by token overlap", () => {
    expect(
      matchTask("Train a word2vec pipeline and honour the omit file", tasks)
        ?.taskId,
    ).toBe("build-word2vec-pipeline");
    expect(
      matchTask("Compute EuroGrid curtailment from grid limits", tasks)?.taskId,
    ).toBe("apex-eurogrid-curtailment");
    expect(matchTask("Refactor the login form CSS", tasks)).toBeNull();
  });
});

describe("groupRuns", () => {
  it("groups the fixtures by public task and clusters the rest", () => {
    const runs = readdirSync(FIXTURES)
      .sort()
      .map((file) =>
        normalizeTrajectory(
          file,
          readFileSync(path.join(FIXTURES, file), "utf8"),
        ),
      );
    const groups = groupRuns(runs, tasks);
    const byId = new Map(groups.map((group) => [group.id, group.files]));
    expect(byId.get("build-word2vec-pipeline")).toEqual([
      "t0001.json",
      "t0005.json",
    ]);
    expect(byId.get("cattrs-compositional-changelog")).toEqual([
      "t0002.jsonl",
      "t0006.jsonl",
    ]);
    expect(byId.get("apex-eurogrid-curtailment")).toEqual(["t0003.jsonl"]);
    const unmatched = groups.filter((group) => group.taskId === null);
    expect(unmatched.map((group) => group.files)).toEqual([["t0004.json"]]);
    expect(unmatched[0]?.id).toMatch(/^cluster-1-/);
  });

  it("puts similar unmatched prompts in one cluster", () => {
    const prompt =
      "Migrate the billing service from callbacks to async await and keep the retry semantics identical";
    const groups = groupRuns(
      [
        run("a.json", prompt),
        run("b.json", `${prompt}. Run 2.`),
        run("c.json", "Write a haiku about the ocean at dawn with seagulls"),
      ],
      tasks,
    );
    expect(groups.map((group) => group.files)).toEqual([
      ["a.json", "b.json"],
      ["c.json"],
    ]);
    expect(groups.every((group) => group.taskId === null)).toBe(true);
  });

  it("lets an unmatched run join its cluster's public task", () => {
    const base =
      "Build the word2vec pipeline for the corpus in data and skip files listed in omit.txt before training";
    const groups = groupRuns(
      [
        run("a.json", base),
        // Same wording, but the task keywords are cut off.
        run(
          "b.json",
          "the corpus in data and skip files listed in omit.txt before training",
        ),
      ],
      [...tasks],
      { minTaskScore: 0.35, clusterThreshold: 0.3 },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.taskId).toBe("build-word2vec-pipeline");
  });
});
