import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createBudget, type LlmClient } from "../../eval/frontiermemory/llm";
import {
  mergeDeterministic,
  mergeWithLlm,
} from "../../eval/frontiermemory/merge";
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
              description: "Writes release notes.",
              steps: ["Read the diff", "Write one line", "Put it first"],
            },
          ],
        }),
        costUsd: 0.001,
      });
    const budget = createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 });
    const merged = await mergeWithLlm(group, deterministic, null, {
      client,
      budget,
      model: "test/model",
      cacheDir: tmp,
    });
    expect(merged.source).toBe("llm");
    expect(merged.instructions.map((item) => item.text)).toEqual([
      "Run the tests before finishing.",
    ]);
    expect(merged.skills[0]?.name).toBe("release-notes");
    expect(budget.usage.calls).toBe(1);

    // Second run hits the cache: no new call.
    const again = await mergeWithLlm(group, deterministic, null, {
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
    const merged = await mergeWithLlm(group, deterministic, null, {
      client: () => Promise.resolve({ text: "sorry, no JSON here" }),
      budget: createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 }),
      model: "test/model",
      cacheDir: tmp,
    });
    expect(merged).toEqual(deterministic.merged);
  });
});
