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
import { runPipeline } from "../../eval/frontiermemory/pipeline";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

const failedSummarySchema = z.object({
  llm: z.object({ calls: z.number(), costUsd: z.number() }),
  output: z.null(),
});

// Lesson calls get a per-task reply; merge calls get an LLM rewrite.
const fakeClient: LlmClient = (call) => {
  const prompt = call.messages.at(-1)?.content ?? "";
  if (prompt.startsWith("# Task:")) {
    return Promise.resolve({
      text: JSON.stringify({
        instructions: [
          { text: "Read the omit file before training.", kind: "procedure" },
        ],
        skills: [
          {
            name: "omit-aware-corpus",
            description: "the corpus must skip omitted files",
            steps: ["Read omit.txt", "Drop listed paths", "Train"],
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
      "skills/omit-aware-corpus-2/SKILL.md",
    ]);
    const skill = readFileSync(
      path.join(tmp, "memory", "skills", "omit-aware-corpus", "SKILL.md"),
      "utf8",
    );
    expect(skill).toContain(
      'description: "Use when the corpus must skip omitted files"',
    );
    const episodes = readFileSync(
      path.join(tmp, "memory.work", "episodes.jsonl"),
      "utf8",
    );
    expect(episodes.trim().split("\n")).toHaveLength(5);
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
