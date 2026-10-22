import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Episode } from "../../eval/frontiermemory/episodes";
import {
  extractLessons,
  parseLessons,
} from "../../eval/frontiermemory/lessons";
import { createBudget, type LlmClient } from "../../eval/frontiermemory/llm";

const REPLY = JSON.stringify([
  {
    lesson: "Read the omit file before you build the corpus.",
    kind: "procedure",
    outcome_link: "led_to_pass",
    scope: "task-specific",
    evidence: "I read omit.txt",
  },
  { lesson: "", kind: "procedure" },
  {
    lesson: "Bad kind",
    kind: "opinion",
    outcome_link: "unclear",
    scope: "general",
    evidence: "",
  },
]);

function episode(id: string): Episode {
  return {
    id,
    groupId: "g",
    text: `## Task prompt\nBuild it ${id}`,
    outcome: "PASS",
    orderHint: null,
    source: `${id}.json`,
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "fm-lessons-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("parseLessons", () => {
  it("keeps valid items and drops malformed ones", () => {
    expect(parseLessons(REPLY)).toEqual([
      {
        lesson: "Read the omit file before you build the corpus.",
        kind: "procedure",
        outcome_link: "led_to_pass",
        scope: "task-specific",
        evidence: "I read omit.txt",
        supersedes: null,
      },
    ]);
    expect(
      parseLessons(`Here you go:\n\`\`\`json\n{"lessons": []}\n\`\`\``),
    ).toEqual([]);
    expect(parseLessons("no json")).toBeNull();
  });
});

describe("extractLessons", () => {
  it("records usage and gateway cost, then serves reruns from cache", async () => {
    const calls: string[] = [];
    const client: LlmClient = (call) => {
      calls.push(call.model);
      return Promise.resolve({
        text: REPLY,
        promptTokens: 500,
        completionTokens: 100,
        costUsd: 0.002,
      });
    };
    const budget = createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 });
    const options = {
      model: "test/model",
      cacheDir: tmp,
      concurrency: 2,
      budget,
      client,
    };
    const first = await extractLessons([episode("a"), episode("b")], options);
    expect(first.map((lessons) => lessons.length)).toEqual([1, 1]);
    expect(calls).toEqual(["test/model", "test/model"]);
    expect(budget.usage).toMatchObject({
      calls: 2,
      promptTokens: 1000,
      completionTokens: 200,
      costUsd: 0.004,
      estimatedCostCalls: 0,
    });
    expect(budget.records.map((record) => record.label)).toEqual([
      "lessons:a.json",
      "lessons:b.json",
    ]);

    const second = await extractLessons([episode("a"), episode("b")], options);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
    expect(budget.usage.cachedCalls).toBe(2);
  });

  it("stops once running cost plus the next estimate passes the cap", async () => {
    let sent = 0;
    const client: LlmClient = () => {
      sent += 1;
      return Promise.resolve({ text: REPLY, costUsd: 0.4 });
    };
    // Estimate per call is tiny, so the running cost is what trips the cap.
    const budget = createBudget(1, { inputUsdPerM: 1, outputUsdPerM: 1 });
    const results = await extractLessons(
      ["a", "b", "c", "d"].map((id) => episode(id)),
      { model: "m", cacheDir: tmp, concurrency: 1, budget, client },
    );
    expect(sent).toBe(3);
    expect(budget.usage.skippedCalls).toBe(1);
    expect(budget.usage.costUsd).toBeCloseTo(1.2);
    expect(results.map((lessons) => lessons.length)).toEqual([1, 1, 1, 0]);
  });

  it("never sends a call whose estimate alone is over the cap", async () => {
    const budget = createBudget(0, { inputUsdPerM: 1, outputUsdPerM: 1 });
    const results = await extractLessons([episode("a")], {
      model: "m",
      cacheDir: tmp,
      concurrency: 1,
      budget,
      client: () => Promise.reject(new Error("must not be called")),
    });
    expect(results).toEqual([[]]);
    expect(budget.usage).toMatchObject({
      calls: 0,
      skippedCalls: 1,
      costUsd: 0,
    });
  });
});
