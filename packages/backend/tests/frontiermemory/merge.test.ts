import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBudget, type LlmClient } from "../../eval/frontiermemory/llm";
import {
  dropUnsafe,
  mergeDeterministic,
  mergeWithLlm,
} from "../../eval/frontiermemory/merge";
import { triggerDescription } from "../../engine/memory/skills/draft";
import type {
  Lesson,
  RunLessons,
  TaskGroup,
} from "../../eval/frontiermemory/types";

const group: TaskGroup = {
  id: "cattrs-compositional-changelog",
  taskId: "cattrs-compositional-changelog",
  label: "cattrs compositional changelog",
  files: [],
};

function lesson(overrides: Partial<Lesson>): Lesson {
  return {
    lesson: "Run the test suite before you finish.",
    kind: "procedure",
    outcome_link: "led_to_pass",
    scope: "general",
    evidence: "",
    supersedes: null,
    ...overrides,
  };
}

function runLessons(
  file: string,
  orderHint: number | null,
  outcome: RunLessons["outcome"],
  lessons: Lesson[],
): RunLessons {
  return { file, orderHint, outcome, lessons };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "fm-merge-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("mergeDeterministic", () => {
  it("keeps the newer preference and records the older as superseded", () => {
    const older = lesson({
      lesson: "Format changelog entries as paragraphs.",
      kind: "preference",
    });
    const newer = lesson({
      lesson: "Format changelog entries as one line.",
      kind: "preference",
    });
    const { merged } = mergeDeterministic(group, [
      // Input order is random; only the order hint decides.
      runLessons("new.json", 2000, "PASS", [newer]),
      runLessons("old.json", 1000, "PASS", [older]),
    ]);
    expect(merged.instructions.map((item) => item.text)).toEqual([
      newer.lesson,
    ]);
    expect(merged.superseded).toEqual([
      { text: older.lesson, supersededBy: newer.lesson },
    ]);
  });

  it("keeps complementary preferences on the same artefact", () => {
    const { merged } = mergeDeterministic(group, [
      runLessons("a.json", 1, "PASS", [
        lesson({
          lesson: "Write changelog entries as one line.",
          kind: "preference",
        }),
      ]),
      runLessons("b.json", 2, "PASS", [
        lesson({
          lesson: "Put the newest changelog entry first.",
          kind: "preference",
        }),
      ]),
    ]);
    expect(merged.instructions).toHaveLength(2);
    expect(merged.superseded).toEqual([]);
  });

  it("honours an explicit supersedes from the newer run", () => {
    const older = lesson({
      lesson: "Use tabs for indentation.",
      kind: "preference",
    });
    const newer = lesson({
      lesson: "Indent with four spaces.",
      kind: "preference",
      supersedes: "Use tabs for indentation",
    });
    const { merged } = mergeDeterministic(group, [
      runLessons("a.json", 1, "PASS", [older]),
      runLessons("b.json", 2, "PASS", [newer]),
    ]);
    expect(merged.instructions.map((item) => item.text)).toEqual([
      newer.lesson,
    ]);
    expect(merged.superseded.map((item) => item.text)).toEqual([older.lesson]);
  });

  it("dedupes near-identical lessons and counts support", () => {
    const { merged } = mergeDeterministic(group, [
      runLessons("a.json", 1, "PASS", [lesson({})]),
      runLessons("b.json", 2, "PASS", [
        lesson({ lesson: "Run the test suite before you finish!" }),
      ]),
    ]);
    expect(merged.instructions).toHaveLength(1);
    expect(merged.instructions[0]?.support).toBe(2);
  });

  it("drops one-run task-specific and run-specific lessons", () => {
    const { merged } = mergeDeterministic(group, [
      runLessons("a.json", 1, "PASS", [
        lesson({ lesson: "Edit line 42 of foo.py.", scope: "task-specific" }),
        lesson({ lesson: "Delete /tmp/run-8f3a2b1c9d/cache first." }),
        lesson({
          lesson: "Ask before changing the public API.",
          kind: "preference",
          scope: "task-specific",
        }),
      ]),
      runLessons("b.json", 2, "FAIL", []),
    ]);
    expect(merged.instructions.map((item) => item.text)).toEqual([
      "Ask before changing the public API.",
    ]);
  });

  it("ranks PASS lessons and FAIL pitfalls above FAIL procedures", () => {
    const { merged } = mergeDeterministic(group, [
      runLessons("a.json", 1, "FAIL", [
        lesson({ lesson: "Train on every file in data." }),
        lesson({
          lesson: "Do not train before reading the omit file.",
          kind: "pitfall",
          outcome_link: "led_to_fail",
        }),
      ]),
      runLessons("b.json", 2, "PASS", [
        lesson({ lesson: "Read the omit file and exclude its paths." }),
      ]),
    ]);
    expect(merged.instructions.map((item) => item.text)).toEqual([
      "Do not train before reading the omit file.",
      "Read the omit file and exclude its paths.",
      "Train on every file in data.",
    ]);
    expect(merged.pass).toBe(1);
    expect(merged.fail).toBe(1);
  });
});

describe("mergeWithLlm", () => {
  const runs = [
    runLessons("a.json", 1, "PASS", [lesson({})]),
    runLessons("b.json", 2, "PASS", [lesson({})]),
  ];

  it("uses the LLM rewrite and drops superseded items it reintroduces", async () => {
    const deterministic = mergeDeterministic(group, [
      ...runs,
      runLessons("c.json", 1, "PASS", [
        lesson({ lesson: "Use tabs for indentation.", kind: "preference" }),
      ]),
      runLessons("d.json", 3, "PASS", [
        lesson({
          lesson: "Indent with spaces.",
          kind: "preference",
          supersedes: "Use tabs for indentation",
        }),
      ]),
    ]);
    const client: LlmClient = () =>
      Promise.resolve({
        text: JSON.stringify({
          instructions: [
            { text: "Run the tests before finishing.", kind: "procedure" },
            { text: "Use tabs for indentation.", kind: "preference" },
          ],
          skills: [
            {
              name: "Release Notes",
              description: "Use when a task asks to write release notes",
              steps: ["Read the diff", "Write one line", "Put it first"],
            },
          ],
        }),
        costUsd: 0.001,
      });
    const budget = createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 });
    const merged = await mergeWithLlm(group, deterministic, {
      client,
      budget,
      model: "test/model",
      cacheDir: tmp,
    });
    expect(merged.source).toBe("llm");
    expect(merged.instructions.map((item) => item.text)).toEqual([
      "Run the tests before finishing.",
    ]);
    expect(merged.skills[0]).toEqual({
      name: "release-notes",
      description: "Use when a task asks to write release notes",
      steps: ["Read the diff", "Write one line", "Put it first"],
    });
    expect(budget.usage.calls).toBe(1);

    // Second run hits the cache: no new call.
    const again = await mergeWithLlm(group, deterministic, {
      client: () => Promise.reject(new Error("must not be called")),
      budget,
      model: "test/model",
      cacheDir: tmp,
    });
    expect(again.instructions).toEqual(merged.instructions);
    expect(budget.usage.cachedCalls).toBe(1);
  });

  it("falls back to the deterministic merge on a bad reply", async () => {
    const deterministic = mergeDeterministic(group, runs);
    const merged = await mergeWithLlm(group, deterministic, {
      client: () => Promise.resolve({ text: "sorry, no JSON here" }),
      budget: createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 }),
      model: "test/model",
      cacheDir: tmp,
    });
    expect(merged).toEqual(deterministic.merged);
  });
});

const procedures = [
  "Read the omit file before you build the corpus.",
  "Lowercase and tokenise each document with the shared cleaner.",
  "Train the model, then save it next to the vocabulary.",
];

const cluster: TaskGroup = {
  id: "cluster-1-corpus-omit",
  taskId: null,
  label: "Build a corpus that skips omitted files",
  files: [],
};

function passingRuns(): RunLessons[] {
  const lessons = procedures.map((text) => lesson({ lesson: text }));
  return [
    runLessons("a.json", 1, "PASS", lessons),
    runLessons("b.json", 2, "PASS", lessons),
  ];
}

function failingRuns(): RunLessons[] {
  return passingRuns().map((run) =>
    runLessons(run.file, run.orderHint, "FAIL", run.lessons),
  );
}

function replyWith(body: object): LlmClient {
  return () => Promise.resolve({ text: JSON.stringify(body), costUsd: 0.001 });
}

const someInstructions = [{ text: "Read the omit file.", kind: "procedure" }];

describe("skills", () => {
  const budget = () => createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 });

  it("builds a fallback skill in the deterministic merge", () => {
    const { merged } = mergeDeterministic(cluster, passingRuns());
    expect(merged.skills).toEqual([
      {
        name: "build-a-corpus-that-skips-omitted-files-workflow",
        description:
          "Use when a task names Build a corpus that skips omitted files.",
        steps: procedures,
      },
    ]);
  });

  it("writes no skill without a PASS run or with fewer than 3 steps", () => {
    const failing = failingRuns();
    expect(mergeDeterministic(cluster, failing).merged.skills).toEqual([]);
    const short = passingRuns().map((run) => ({
      ...run,
      lessons: run.lessons.slice(0, 2),
    }));
    expect(mergeDeterministic(cluster, short).merged.skills).toEqual([]);
  });

  it("falls back when a required skill is missing from the reply", async () => {
    const deterministic = mergeDeterministic(cluster, passingRuns());
    const merged = await mergeWithLlm(cluster, deterministic, {
      client: replyWith({
        title: "Omit-aware corpus build",
        instructions: someInstructions,
        skills: [],
      }),
      budget: budget(),
      model: "test/model",
      cacheDir: tmp,
    });
    expect(merged.source).toBe("llm");
    expect(merged.label).toBe("Omit-aware corpus build");
    expect(merged.skills).toEqual([
      {
        name: "omit-aware-corpus-build-workflow",
        description: "Use when a task names Omit-aware corpus build.",
        steps: procedures,
      },
    ]);
  });

  it("repairs vague descriptions and drops run-specific steps", async () => {
    const deterministic = mergeDeterministic(cluster, passingRuns());
    const merged = await mergeWithLlm(cluster, deterministic, {
      client: replyWith({
        title: "[[7, 7, 7], [0, 1]]",
        instructions: someInstructions,
        skills: [
          {
            name: "corpus-build",
            description: "Use when working on this task.",
            steps: [
              "1. Read the omit file.",
              "Load the 1532 rows of the train split.",
              "The model trains fast.",
              "Delete /tmp/run-a1b2/cache.",
              "Clean each document.",
              "Train and save the model.",
            ],
          },
          { name: "too-short", description: "x", steps: ["Run it"] },
        ],
      }),
      budget: budget(),
      model: "test/model",
      cacheDir: tmp,
    });
    // A JSON title is rejected; the heuristic label stays.
    expect(merged.label).toBe(cluster.label);
    expect(merged.skills).toEqual([
      {
        name: "corpus-build",
        description:
          "Use when a task names Build a corpus that skips omitted files.",
        steps: [
          "Read the omit file.",
          "Clean each document.",
          "Train and save the model.",
        ],
      },
    ]);
  });

  it("drops model skills when no run passed", async () => {
    const failing = failingRuns();
    const merged = await mergeWithLlm(
      cluster,
      mergeDeterministic(cluster, failing),
      {
        client: replyWith({
          instructions: someInstructions,
          skills: [
            {
              name: "corpus-build",
              description: "Use when a task asks to build a corpus",
              steps: procedures,
            },
          ],
        }),
        budget: budget(),
        model: "test/model",
        cacheDir: tmp,
      },
    );
    expect(merged.skills).toEqual([]);
  });

  it("keeps the tasks.json title for known tasks", async () => {
    const merged = await mergeWithLlm(
      group,
      mergeDeterministic(group, passingRuns()),
      {
        client: replyWith({
          title: "Something else",
          instructions: someInstructions,
        }),
        budget: budget(),
        model: "test/model",
        cacheDir: tmp,
      },
    );
    expect(merged.label).toBe(group.label);
    expect(merged.skills[0]?.description).toBe(
      "Use when a task names cattrs compositional changelog.",
    );
  });

  it("tells the model when a skill is required", async () => {
    const prompts: string[] = [];
    await mergeWithLlm(cluster, mergeDeterministic(cluster, passingRuns()), {
      client: (call) => {
        prompts.push(call.messages.at(-1)?.content ?? "");
        return Promise.resolve({ text: "{}" });
      },
      budget: budget(),
      model: "test/model",
      cacheDir: tmp,
    });
    expect(prompts[0]).toContain("Define at least 1 and at most 3 skills.");
    expect(prompts[0]).toContain("; PASS-backed] Read the omit file");
  });
});

describe("triggerDescription", () => {
  it.each([
    [
      "Use when a task names the omit file",
      "Use when a task names the omit file",
    ],
    [
      "use when a task asks to build a gensim corpus",
      "Use when a task asks to build a gensim corpus",
    ],
    [
      "Use when you need to train a Word2Vec model",
      "Use when a task asks to train a Word2Vec model",
    ],
    ["Use when the user mentions cattrs", "Use when a task names cattrs"],
    ["Use when working on the corpus task", null],
    ["Use when a task asks to do similar work", null],
    ["Use when a task names this task", null],
    ["Builds a corpus.", null],
  ])("%j -> %j", (input, expected) => {
    expect(triggerDescription(input)).toBe(expected);
  });
});

describe("dropUnsafe", () => {
  it("filters a deterministic merge and counts the drops", () => {
    const steps = [
      "Run the linter by hand.",
      "Find the failing hook.",
      "Run git commit --no-verify to skip it.",
    ];
    const { merged } = mergeDeterministic(group, [
      runLessons(
        "a.json",
        1,
        "PASS",
        steps.map((text) => lesson({ lesson: text })),
      ),
      runLessons("b.json", 2, "PASS", [
        ...steps.map((text) => lesson({ lesson: text })),
        lesson({ lesson: "Never force-push to main.", kind: "pitfall" }),
      ]),
    ]);
    expect(merged.skills).toHaveLength(1);
    const { group: safe, dropped } = dropUnsafe({
      ...merged,
      superseded: [
        { text: "Commit with HUSKY=0.", supersededBy: "Fix the hook first." },
      ],
    });
    expect(dropped).toEqual({ instructions: 2, skills: 1 });
    expect(safe.skills).toEqual([]);
    expect(safe.superseded).toEqual([]);
    expect(safe.instructions.map((item) => item.text)).toEqual(
      expect.arrayContaining([
        "Run the linter by hand.",
        "Never force-push to main.",
      ]),
    );
    expect(safe.instructions).toHaveLength(3);
  });
});
