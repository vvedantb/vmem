import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  groupRuns,
  matchTask,
  mentionTerms,
} from "../../eval/frontiermemory/group";
import {
  normalizeRuns,
  normalizeTrajectory,
  parseTrajectory,
} from "../../eval/frontiermemory/normalize";
import { DEFAULT_TASKS_PATH } from "../../eval/frontiermemory/pipeline";
import { taskSpecSchema } from "../../eval/frontiermemory/types";
import type { NormalizedRun, TaskSpec } from "../../eval/frontiermemory/types";

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
    trajectory: [],
    outcome: "UNKNOWN",
    orderHint: null,
    approxTokens: 0,
    mentions: {},
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

  it("needs a task keyword, not just shared generic words", () => {
    expect(
      matchTask(
        "Build a data pipeline that skips omitted files when building the corpus",
        tasks,
      ),
    ).toBeNull();
    expect(
      matchTask("Write a one-line changelog entry, newest first", tasks),
    ).toBeNull();
  });

  it("matches a run set in a task's world by its body mentions", () => {
    expect(
      matchTask("Which region had the longest outages?", tasks, {
        eurogrid: 120,
        curtailment: 3,
      }),
    ).toEqual({
      taskId: "apex-eurogrid-curtailment",
      via: "body",
      score: 120,
    });
  });

  it("ignores a passing mention in the run body", () => {
    // A pinned dependency or a directory listing names a task once or twice.
    expect(
      matchTask("Add a timeout option to the HTTP client", tasks, {
        cattrs: 2,
      }),
    ).toBeNull();
  });

  describe("cooccur rule", () => {
    const widget: TaskSpec = {
      id: "widgetlib-release-notes",
      source: "synthetic",
      title: "widgetlib release notes",
      description: "",
      keywords: ["widgetlib"],
      cooccur: { term: "widgetlib", with: "release notes", min: 2 },
    };
    const withWidget = [...tasks, widget];

    it("counts the cooccur terms too", () => {
      expect(mentionTerms([widget])).toEqual(["widgetlib", "release notes"]);
    });

    it("matches a few name mentions next to the co-term", () => {
      expect(
        matchTask("Add a timeout option", withWidget, {
          widgetlib: 2,
          "release notes": 3,
        }),
      ).toEqual({
        taskId: "widgetlib-release-notes",
        via: "cooccur",
        score: 2,
      });
    });

    it.each([
      ["one passing mention", { widgetlib: 1, "release notes": 3 }],
      ["no co-term", { widgetlib: 5 }],
    ])("ignores %s", (_name, mentions) => {
      expect(
        matchTask("Add a timeout option", withWidget, mentions),
      ).toBeNull();
    });

    it("loses to a strong body match", () => {
      expect(
        matchTask("Add a timeout option", withWidget, {
          widgetlib: 3,
          "release notes": 1,
          eurogrid: 40,
        })?.taskId,
      ).toBe("apex-eurogrid-curtailment");
    });
  });

  it("prefers a prompt match over body mentions of another task", () => {
    expect(
      matchTask("Train a gensim Word2Vec model on the sentences", tasks, {
        eurogrid: 300,
      })?.taskId,
    ).toBe("build-word2vec-pipeline");
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
      "t0008.json",
    ]);
    expect(byId.get("cattrs-compositional-changelog")).toEqual([
      "t0002.jsonl",
      "t0006.jsonl",
    ]);
    expect(byId.get("apex-eurogrid-curtailment")).toEqual(["t0003.jsonl"]);
    const unmatched = groups.filter((group) => group.taskId === null);
    expect(unmatched.map((group) => group.files)).toEqual([
      ["t0004.json"],
      ["t0007.jsonl"],
    ]);
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

  it("splits runs that share a harness preamble by their real task", () => {
    const preamble =
      "You are a shell agent. You get a task and the screen output of earlier commands, and you reply with commands as JSON with a plan and a list of keystrokes.";
    const tasksText = [
      "Compile the C project in /src with make and fix every warning.",
      "Find the largest prime below one million and write it to answer.txt.",
    ];
    const raws = [0, 1, 0, 1, 0, 1].map((i) =>
      JSON.stringify({
        messages: [
          {
            role: "user",
            content: `${preamble}\n\nTask Description:\n${tasksText[i]}\n\nCurrent terminal state:\nroot@box:/#`,
          },
          { role: "assistant", content: "Done." },
          { role: "user", content: "# Verifier result\n\nPASS" },
        ],
      }),
    );
    const groups = groupRuns(
      normalizeRuns(
        raws.map((raw, i) => parseTrajectory(`p${i}.json`, raw)),
        6000,
      ),
      tasks,
    );
    expect(groups.map((group) => group.files)).toEqual([
      ["p0.json", "p2.json", "p4.json"],
      ["p1.json", "p3.json", "p5.json"],
    ]);
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
      { minBodyMentions: 20, clusterThreshold: 0.3 },
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.taskId).toBe("build-word2vec-pipeline");
  });
});
