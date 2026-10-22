import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTrajectory } from "../../eval/frontiermemory/normalize";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

function load(file: string) {
  return normalizeTrajectory(
    file,
    readFileSync(path.join(FIXTURES, file), "utf8"),
  );
}

describe("normalizeTrajectory", () => {
  it.each([
    ["t0001.json", "atif", "PASS"],
    ["t0002.jsonl", "claude-code", "FAIL"],
    ["t0003.jsonl", "codex", "PASS"],
    ["t0004.json", "generic", "FAIL"],
    ["t0005.json", "opencode", "FAIL"],
    ["t0006.jsonl", "acp", "PASS"],
  ])("sniffs %s as %s with outcome %s", (file, format, outcome) => {
    const run = load(file);
    expect(run.format).toBe(format);
    expect(run.outcome).toBe(outcome);
    expect(run.taskPrompt).not.toMatch(/Verifier result/);
    expect(run.userFeedback.join("\n")).not.toMatch(/Verifier result/);
  });

  it("takes the first substantive user message as the task prompt", () => {
    expect(load("t0002.jsonl").taskPrompt).toMatch(/^Write the changelog/);
    // Codex injects an <environment_context> user message first.
    expect(load("t0003.jsonl").taskPrompt).toMatch(/^Compute the EuroGrid/);
    expect(load("t0001.json").taskPrompt).toMatch(/^Build a Word2Vec/);
  });

  it("keeps user corrections as feedback but not tool results", () => {
    expect(load("t0002.jsonl").userFeedback).toEqual([
      "No. Keep each changelog entry to one line and put the newest entry first.",
    ]);
    expect(load("t0004.json").userFeedback).toEqual([
      "Please also add a regression test for leap years.",
    ]);
    expect(load("t0001.json").userFeedback).toEqual([]);
  });

  it("keeps assistant prose and drops thinking and tool parts", () => {
    expect(load("t0002.jsonl").finalAssistant).toEqual([
      "I added a three-paragraph entry at the bottom of CHANGELOG.md.",
      "Done: one-line entry at the top.",
    ]);
    // ACP message chunks are joined into one turn.
    expect(load("t0006.jsonl").finalAssistant).toEqual([
      "Adding a one-line entry at the top.",
    ]);
  });

  it("uses the earliest timestamp as the order hint", () => {
    expect(load("t0001.json").orderHint).toBe(
      Date.parse("2026-03-01T10:00:00Z"),
    );
    expect(load("t0005.json").orderHint).toBe(1767312000000);
    expect(load("t0006.jsonl").orderHint).toBeNull();
  });

  it("reads the verdict from raw text when the shape is unknown", () => {
    const raw = JSON.stringify({
      blob: "lots of text",
      tail: "# Verifier result\n\nPASS",
    });
    expect(normalizeTrajectory("x.json", raw).outcome).toBe("PASS");
    expect(normalizeTrajectory("y.json", "not json at all").outcome).toBe(
      "UNKNOWN",
    );
  });

  it("caps the kept text, keeping the prompt head and the run tail", () => {
    const messages = [
      { role: "user", content: `START ${"p".repeat(20_000)} PROMPT_END` },
      ...Array.from({ length: 30 }, (_, i) => ({
        role: "assistant",
        content: `turn ${i} ${"a".repeat(3000)} END_${i}`,
      })),
      { role: "user", content: "# Verifier result\nFAIL" },
    ];
    const run = normalizeTrajectory("big.json", JSON.stringify({ messages }), {
      maxTokens: 1000,
      finalAssistantTurns: 4,
    });
    expect(run.approxTokens).toBeLessThanOrEqual(1000);
    expect(run.taskPrompt.startsWith("START")).toBe(true);
    expect(run.taskPrompt).not.toContain("PROMPT_END");
    expect(run.finalAssistant.at(-1)).toMatch(/END_29$/);
    expect(run.outcome).toBe("FAIL");
  });
});
