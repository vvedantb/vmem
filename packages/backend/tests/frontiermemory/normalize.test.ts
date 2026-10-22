import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractTaskText,
  normalizeRuns,
  normalizeTrajectory,
  parseTrajectory,
} from "../../eval/frontiermemory/normalize";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

function load(file: string) {
  return normalizeTrajectory(
    file,
    readFileSync(path.join(FIXTURES, file), "utf8"),
  );
}

type Message = { role: string; content: string };

/** A generic-format run: messages, then the verifier. */
function rawRun(messages: Message[], verdict = "PASS"): string {
  return JSON.stringify({
    messages: [
      ...messages,
      { role: "user", content: `# Verifier result\n\n${verdict}` },
    ],
  });
}

function corpus(runs: string[]) {
  return normalizeRuns(
    runs.map((raw, i) => parseTrajectory(`r${i}.json`, raw)),
    6000,
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
    ["t0007.jsonl", "acp", "FAIL"],
    ["t0008.json", "atif", "PASS"],
  ])("sniffs %s as %s with outcome %s", (file, format, outcome) => {
    const run = load(file);
    expect(run.format).toBe(format);
    expect(run.outcome).toBe(outcome);
    expect(run.taskPrompt).not.toMatch(/Verifier result/);
    expect(run.userFeedback.join("\n")).not.toMatch(/Verifier result/);
    expect(run.trajectory.length).toBeGreaterThan(0);
  });

  it("takes the first substantive user message as the task prompt", () => {
    expect(load("t0002.jsonl").taskPrompt).toMatch(/^Write the changelog/);
    // Codex injects an <environment_context> user message first.
    expect(load("t0003.jsonl").taskPrompt).toMatch(/^Compute the EuroGrid/);
    expect(load("t0001.json").taskPrompt).toMatch(/^Build a Word2Vec/);
    // Flat ACP records: the prompt has no role field.
    expect(load("t0007.jsonl").taskPrompt).toMatch(/^Resize every image/);
  });

  it("takes the task after a task marker and drops the harness preamble", () => {
    const prompt = load("t0008.json").taskPrompt;
    expect(prompt).toMatch(/^Implement task_func/);
    expect(prompt).toContain("gensim Word2Vec");
    expect(prompt).not.toMatch(/shell agent|Reply as JSON|terminal state/);
  });

  it("keeps user corrections as feedback but not tool results", () => {
    expect(load("t0002.jsonl").userFeedback).toEqual([
      "No. Keep each changelog entry to one line and put the newest entry first.",
    ]);
    expect(load("t0004.json").userFeedback).toEqual([
      "Please also add a regression test for leap years.",
    ]);
    expect(load("t0001.json").userFeedback).toEqual([]);
    // Curated feedback after the run, before the verifier.
    expect(load("t0007.jsonl").userFeedback).toEqual([
      "Next time keep the aspect ratio of tall images.",
    ]);
  });

  it("keeps reasoning, tool calls, results and errors in order", () => {
    expect(load("t0002.jsonl").trajectory).toEqual([
      "thinking: hidden",
      "assistant: I added a three-paragraph entry at the bottom of CHANGELOG.md.",
      "call: Edit {}",
      "result: File edited",
      "assistant: Done: one-line entry at the top.",
    ]);
    expect(load("t0001.json").trajectory).toEqual([
      "assistant: I read omit.txt and excluded those files before tokenising.",
      "call: bash cat omit.txt",
      "result: data/b.txt",
      "assistant: Training finished. The model is saved to model.bin.",
    ]);
    expect(load("t0003.jsonl").trajectory).toEqual([
      "call: shell ls -a",
      "result: .grid.toml",
      "assistant: The limits are in the hidden .grid.toml file. I applied the curtailment rules per region.",
    ]);
    expect(load("t0005.json").trajectory).toEqual([
      "call: bash",
      "result: ok",
      "assistant: I forgot to read the omit list and trained on all files.",
    ]);
    // ACP message chunks are joined into one turn.
    expect(load("t0006.jsonl").trajectory).toEqual([
      "assistant: Adding a one-line entry at the top.",
      "call: edit",
    ]);
    expect(load("t0007.jsonl").trajectory).toEqual([
      "thinking: First I check which image tools are installed.",
      "call: which convert",
      "error: (failed, no output)",
      "call: python3 resize.py",
      "result: resized 12 files",
      "assistant: Listed the new sizes in sizes.csv.",
    ]);
    const terminus = load("t0008.json").trajectory;
    expect(terminus.slice(0, 3)).toEqual([
      "thinking: The tokenizer must drop punctuation before training.",
      "assistant: Plan: write the function, then run the tests.",
      "call: bash_command python3 -m pytest -q",
    ]);
    expect(terminus[3]).toMatch(/^error: Traceback[\s\S]*ModuleNotFoundError/);
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

  it("counts task keywords in the whole raw run", () => {
    const raw = rawRun([
      { role: "user", content: "Summarise the outage report." },
      { role: "tool", content: "EuroGrid report. eurogrid region 4." },
    ]);
    const run = normalizeTrajectory("m.json", raw, {
      maxTokens: 6000,
      keywords: ["eurogrid", "cattrs"],
    });
    expect(run.mentions).toEqual({ eurogrid: 2, cattrs: 0 });
  });

  it("fills the cap: prompt ends, newest feedback, first and newest steps", () => {
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
      keywords: [],
    });
    expect(run.approxTokens).toBeLessThanOrEqual(1000);
    expect(run.approxTokens).toBeGreaterThan(900);
    expect(run.taskPrompt.startsWith("START")).toBe(true);
    expect(run.taskPrompt.endsWith("PROMPT_END")).toBe(true);
    expect(run.taskPrompt.length).toBeLessThanOrEqual(1200);
    expect(run.trajectory[0]).toMatch(/^assistant: turn 0 /);
    expect(run.trajectory.some((step) => /steps omitted/.test(step))).toBe(
      true,
    );
    expect(run.trajectory.at(-1)).toMatch(/END_29$/);
    expect(run.outcome).toBe("FAIL");
  });

  it("uses most of the default 6000-token cap on a long tool-heavy run", () => {
    const steps = Array.from({ length: 120 }, (_, i) => [
      { role: "assistant", content: `Step ${i}: run the next check.` },
      { role: "tool", content: `check ${i} output ${"x".repeat(400)}` },
    ]).flat();
    const run = normalizeTrajectory(
      "long.json",
      rawRun([{ role: "user", content: "Make every check pass." }, ...steps]),
    );
    expect(run.approxTokens).toBeGreaterThan(5000);
    expect(run.approxTokens).toBeLessThanOrEqual(6000);
    expect(
      run.trajectory.filter((s) => s.startsWith("result: check")).length,
    ).toBeGreaterThan(20);
  });
});

describe("extractTaskText", () => {
  it("takes a heading section and stops at the next heading of its level", () => {
    const text = [
      "# Support Policy",
      "Be polite. Never share account data.",
      "## Request",
      "Move the Berlin office meeting to Friday and tell the team.",
      "## Workspace",
      "The systems are simulated behind an MCP server.",
    ].join("\n\n");
    expect(extractTaskText(text)).toBe(
      "Move the Berlin office meeting to Friday and tell the team.",
    );
  });

  it("strips harness tag blocks and quotes around the prompt", () => {
    expect(
      extractTaskText(
        '<system-reminder>Use the tools.</system-reminder>\n"Rename the config loader to load_settings."',
      ),
    ).toBe("Rename the config loader to load_settings.");
    expect(extractTaskText("# AGENTS.md instructions for /repo\n...")).toBe("");
  });

  it("keeps the whole message when the marker section is too short", () => {
    const text =
      "## Task\n\nok\n\n## Notes\n\nRefactor the parser into two modules.";
    expect(extractTaskText(text)).toBe(text);
  });
});

describe("normalizeRuns (corpus boilerplate)", () => {
  const PREAMBLE =
    "You are an automation agent. Use the tools you have and do not ask questions.";
  const TASKS = [
    "Draft the quarterly report for the Lisbon office.",
    "Close every stale ticket in the support queue.",
    "Book a meeting room for the design review on Monday.",
  ];

  it("strips a preamble shared by runs of different tasks", () => {
    const runs = corpus(
      [...TASKS, ...TASKS].map((task) =>
        rawRun([
          { role: "user", content: `${PREAMBLE}\n\n${task}` },
          { role: "assistant", content: "Done." },
        ]),
      ),
    );
    expect(runs.map((run) => run.taskPrompt)).toEqual([...TASKS, ...TASKS]);
  });

  it("keeps a real task repeated in many runs with varied feedback", () => {
    const task = "Read sales.csv.\n\nWrite the monthly totals to report.md.";
    const runs = corpus(
      Array.from({ length: 8 }, (_, i) =>
        rawRun([
          { role: "user", content: task },
          { role: "assistant", content: "Done." },
          // After the last assistant turn: post-run feedback.
          { role: "user", content: `Next time, also check rule ${i}.` },
        ]),
      ),
    );
    for (const run of runs) {
      expect(run.taskPrompt).toBe(task);
      expect(run.userFeedback).toHaveLength(1);
    }
  });

  it("takes the task from a later message when the first is a shared intro", () => {
    const intro =
      "You are in the repository at /app.\n\nAsk the maintainer what change they need.";
    const requests = [
      "Add a retry option to the HTTP client.",
      "Support YAML config files in the loader.",
      "Make the CLI print a progress bar.",
      "Cache parsed templates between renders.",
      "Return 404 for unknown routes instead of 500.",
    ];
    const runs = corpus(
      requests.map((request) =>
        rawRun([
          { role: "user", content: intro },
          { role: "assistant", content: "What change do you need?" },
          { role: "user", content: request },
          { role: "assistant", content: "Implemented." },
        ]),
      ),
    );
    expect(runs.map((run) => run.taskPrompt)).toEqual(requests);
    expect(runs.every((run) => run.userFeedback.length === 0)).toBe(true);
  });

  it("does nothing on a single run", () => {
    const raw = rawRun([
      { role: "user", content: `${PREAMBLE}\n\n${TASKS[0]}` },
      { role: "assistant", content: "Done." },
    ]);
    expect(corpus([raw])[0]?.taskPrompt).toBe(`${PREAMBLE}\n\n${TASKS[0]}`);
  });
});
