import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseCliArgs } from "../../eval/frontiermemory/cli";
import type { LlmClient } from "../../eval/frontiermemory/llm";
import {
  DEFAULT_TASKS_PATH,
  runPipeline,
} from "../../eval/frontiermemory/pipeline";
import { taskSpecSchema } from "../../eval/frontiermemory/types";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

const failedSummarySchema = z.object({
  llm: z.object({ calls: z.number(), costUsd: z.number() }),
  output: z.null(),
});

const tasksSchema = z.array(taskSpecSchema);

// Every prompt sent to the fake client, system and user messages joined.
let sentPrompts: string[] = [];

// Lesson calls get a per-task reply; merge calls get an LLM rewrite.
const fakeClient: LlmClient = (call) => {
  sentPrompts.push(call.messages.map((message) => message.content).join("\n"));
  const prompt = call.messages.at(-1)?.content ?? "";
  if (prompt.startsWith("# Topic:")) {
    return Promise.resolve({
      text: JSON.stringify({
        instructions: [
          { text: "Read the omit file before training.", kind: "procedure" },
        ],
        skills: [
          {
            name: "omit-aware-corpus",
            description: "the corpus must skip omitted files",
            steps: ["Read omit.txt", "Drop listed paths", "Train the model"],
          },
        ],
      }),
      costUsd: 0.001,
    });
  }
  const lesson = prompt.includes("changelog")
    ? {
        lesson: "Write each changelog entry as one line, newest first.",
        kind: "preference",
      }
    : {
        lesson: "Read the omit file before you build the corpus.",
        kind: "procedure",
      };
  return Promise.resolve({
    text: JSON.stringify([
      {
        ...lesson,
        outcome_link: "led_to_pass",
        scope: "general",
        evidence: "",
      },
    ]),
    costUsd: 0.001,
  });
};

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "fm-pipeline-"));
  sentPrompts = [];
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function options(extra: string[]) {
  const { help: _help, ...parsed } = parseCliArgs([
    "--input",
    FIXTURES,
    "--out",
    path.join(tmp, "memory"),
    ...extra,
  ]);
  return parsed;
}

describe("runPipeline", () => {
  it("dry run groups and estimates without calls or output", async () => {
    const summary = await runPipeline(options(["--dry-run"]), () =>
      Promise.reject(new Error("must not be called")),
    );
    expect(summary.runs).toBe(8);
    expect(summary.estimate.lessonCalls).toBe(8);
    expect(summary.estimate.costUsd).toBeGreaterThan(0);
    expect(summary.llm).toBeNull();
    expect(existsSync(path.join(tmp, "memory"))).toBe(false);
    expect(existsSync(path.join(tmp, "memory.work", "episodes.jsonl"))).toBe(
      true,
    );
  });

  it("writes a memory folder for the selected tasks", async () => {
    const summary = await runPipeline(
      options([
        "--tasks",
        "build-word2vec-pipeline,cattrs-compositional-changelog",
      ]),
      fakeClient,
    );
    expect(summary.groups.map((group) => group.id)).toEqual([
      "build-word2vec-pipeline",
      "cattrs-compositional-changelog",
    ]);
    expect(summary.llm).toMatchObject({
      calls: 7,
      skippedCalls: 0,
      budgetHit: false,
    });
    expect(summary.output?.files).toEqual([
      "MEMORY.md",
      "topics/build-word2vec-pipeline.md",
      "skills/omit-aware-corpus/SKILL.md",
      "topics/cattrs-compositional-changelog.md",
    ]);
    // Both groups wrote the same skill: one file, linked from both topics.
    expect(summary).toMatchObject({
      skillsBeforeDedupe: 2,
      skillsAfterDedupe: 1,
    });
    const cattrsTopic = readFileSync(
      path.join(tmp, "memory", "topics", "cattrs-compositional-changelog.md"),
      "utf8",
    );
    expect(cattrsTopic).toContain("(../skills/omit-aware-corpus/SKILL.md)");
    const skill = readFileSync(
      path.join(tmp, "memory", "skills", "omit-aware-corpus", "SKILL.md"),
      "utf8",
    );
    // Not a direct trigger: repaired from the known task title.
    expect(skill).toContain(
      'description: "Use when a task names BigCodeBench Word2Vec Pipeline."',
    );
    const episodes = readFileSync(
      path.join(tmp, "memory.work", "episodes.jsonl"),
      "utf8",
    );
    expect(episodes.trim().split("\n")).toHaveLength(5);
  });

  it("never sends tasks.json titles or descriptions to the LLM", async () => {
    const tasks = tasksSchema.parse(
      JSON.parse(readFileSync(DEFAULT_TASKS_PATH, "utf8")),
    );
    await runPipeline(options([]), fakeClient);
    const mergePrompts = sentPrompts.filter((prompt) =>
      prompt.includes("# Topic:"),
    );
    expect(mergePrompts.length).toBeGreaterThan(0);
    expect(sentPrompts.length).toBeGreaterThan(mergePrompts.length);
    for (const task of tasks) {
      for (const prompt of sentPrompts) {
        expect(prompt).not.toContain(task.description);
      }
      // Lesson prompts hold run text, which may name a task on its own.
      for (const prompt of mergePrompts) {
        expect(prompt).not.toContain(task.title);
      }
    }
  });

  it("falls back to the deterministic merge with --no-llm-merge", async () => {
    const summary = await runPipeline(
      options(["--tasks", "cattrs-compositional-changelog", "--no-llm-merge"]),
      fakeClient,
    );
    expect(summary.merged).toEqual([
      {
        groupId: "cattrs-compositional-changelog",
        source: "deterministic",
        instructions: 1,
        skills: 0,
        droppedUnsafe: { instructions: 0, skills: 0 },
      },
    ]);
    const topic = readFileSync(
      path.join(tmp, "memory", "topics", "cattrs-compositional-changelog.md"),
      "utf8",
    );
    expect(topic).toContain(
      "- Write each changelog entry as one line, newest first.",
    );
  });

  it("drops unsafe merge output before export", async () => {
    const unsafeClient: LlmClient = (call) => {
      const prompt = call.messages.at(-1)?.content ?? "";
      if (!prompt.startsWith("# Topic:")) return fakeClient(call);
      return Promise.resolve({
        text: JSON.stringify({
          instructions: [
            { text: "Read the omit file before training.", kind: "procedure" },
            { text: "Never use --no-verify; fix the hook.", kind: "pitfall" },
            {
              text: "Use git commit --no-verify when the hook fails.",
              kind: "procedure",
            },
          ],
          skills: [
            {
              name: "bypass-precommit-hooks",
              description: "Use when a task asks to commit and a hook fails.",
              steps: [
                "Run lint and tests by hand.",
                "Find the failing hook.",
                "Run git commit --no-verify.",
              ],
            },
          ],
        }),
        costUsd: 0.001,
      });
    };
    const summary = await runPipeline(
      options(["--tasks", "build-word2vec-pipeline"]),
      unsafeClient,
    );
    expect(summary.merged[0]).toMatchObject({
      instructions: 2,
      skills: 0,
      droppedUnsafe: { instructions: 1, skills: 1 },
    });
    expect(summary.droppedUnsafe).toEqual({ instructions: 1, skills: 1 });
    expect(summary.output?.files).toEqual([
      "MEMORY.md",
      "topics/build-word2vec-pipeline.md",
    ]);
    const topic = readFileSync(
      path.join(tmp, "memory", "topics", "build-word2vec-pipeline.md"),
      "utf8",
    );
    expect(topic).toContain("- Never use --no-verify; fix the hook.");
    expect(topic).not.toContain("when the hook fails");
  });

  it("records spend when the export fails", async () => {
    // A foreign file in the out folder makes the export refuse to write.
    mkdirSync(path.join(tmp, "memory"));
    writeFileSync(path.join(tmp, "memory", "notes.txt"), "keep me");
    await expect(
      runPipeline(
        options(["--tasks", "cattrs-compositional-changelog"]),
        fakeClient,
      ),
    ).rejects.toThrow(/refusing/);
    const work = path.join(tmp, "memory.work");
    const calls = readFileSync(path.join(work, "llm-calls.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(calls.length).toBeGreaterThan(0);
    const summary = failedSummarySchema.parse(
      JSON.parse(readFileSync(path.join(work, "summary.json"), "utf8")),
    );
    expect(summary.llm.calls).toBe(calls.length);
    expect(summary.llm.costUsd).toBeGreaterThan(0);
  });

  it("rejects unknown task ids", async () => {
    await expect(
      runPipeline(options(["--tasks", "nope"]), fakeClient),
    ).rejects.toThrow(/Unknown task id/);
  });
});
