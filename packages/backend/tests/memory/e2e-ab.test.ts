import { z } from "zod";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sampleStddev, summariseArm } from "../../eval/e2e-ab/aggregate";
import { parseCliArgs } from "../../eval/e2e-ab/cli";
import type { SpawnClaude } from "../../eval/e2e-ab/claude";
import { runAgent } from "../../eval/e2e-ab/claude";
import { loadFixture, loadFixtures } from "../../eval/e2e-ab/fixture";
import {
  ContaminationError,
  bannedFragments,
  createContaminationGuard,
  findBannedFragment,
} from "../../eval/e2e-ab/guard";
import { parseJudgeOutput } from "../../eval/e2e-ab/judge";
import { extractAnswer } from "../../eval/e2e-ab/prompts";
import { runE2eAb, evalE2eAbEnabled } from "../../eval/e2e-ab/run";
import { resolveSeedConfig, seedFixture } from "../../eval/e2e-ab/seed";
import { parseStreamLine, splitNdjson } from "../../eval/e2e-ab/stream";
import type { Trial } from "../../eval/e2e-ab/types";
import { parseYaml } from "../../eval/e2e-ab/yaml";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "e2e-ab-test-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const neverSpawn: SpawnClaude = () => {
  throw new Error("spawn must not be called");
};

function trial(overrides: Partial<Trial>): Trial {
  return {
    fixtureId: "f",
    arm: "off",
    repeat: 1,
    dryRun: false,
    answer: "a",
    score: null,
    judge: null,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    contaminated: false,
    judgeError: false,
    error: null,
    ...overrides,
  };
}

const writtenTrialSchema = z.object({
  fixtureId: z.string(),
  arm: z.string(),
  repeat: z.number(),
  dryRun: z.boolean(),
  score: z.number().nullable(),
});

const writtenReportSchema = z.object({
  trials: z.array(writtenTrialSchema),
  dryRun: z.boolean(),
});

describe("fixtures", () => {
  it("loads all starter fixtures with unique ids", () => {
    const fixtures = loadFixtures();
    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(6);
    expect(fixtures.map((f) => f.id)).toContain("stale-vs-updated");
  });

  it("keeps the abstention fixture irrelevant to its question", () => {
    const fixture = loadFixtures().find((f) => f.kind === "abstention");
    expect(fixture?.expectedAbstention).toBe(true);
    const seedText = fixture?.seedMemories
      .map((m) => m.content)
      .join(" ")
      .toLowerCase();
    expect(seedText).not.toMatch(/\b(dog|vet|pet)\b/);
  });

  it("loads JSON fixtures and rejects invalid ones", () => {
    const [first] = loadFixtures();
    writeFileSync(path.join(tmp, "one.json"), JSON.stringify(first));
    expect(loadFixture(path.join(tmp, "one.json")).id).toBe(first?.id);
    writeFileSync(
      path.join(tmp, "bad.json"),
      JSON.stringify({
        ...first,
        expectedAbstention: !first?.expectedAbstention,
      }),
    );
    expect(() => loadFixture(path.join(tmp, "bad.json"))).toThrow();
  });
});

describe("yaml", () => {
  it("parses maps, lists, block scalars and comments", () => {
    const parsed = parseYaml(
      [
        "# header comment",
        "id: demo   # trailing",
        "n: 0.95",
        "flag: true",
        "tags: [a, b]",
        "task: |",
        "  line one",
        "  # kept as text",
        "",
        "  line two",
        "short: |-",
        "  no newline",
        "facts:",
        "  - Helix",
        '  - "14:00"',
        "items:",
        "  - title: One",
        "    tags: []",
        "  - title: Two",
        "    n: 2",
      ].join("\n"),
    );
    expect(parsed).toEqual({
      id: "demo",
      n: 0.95,
      flag: true,
      tags: ["a", "b"],
      task: "line one\n# kept as text\n\nline two\n",
      short: "no newline",
      facts: ["Helix", "14:00"],
      items: [
        { title: "One", tags: [] },
        { title: "Two", n: 2 },
      ],
    });
  });

  it("rejects duplicate keys", () => {
    expect(() => parseYaml("a: 1\na: 2")).toThrow(/Duplicate/);
  });
});

describe("stream parser", () => {
  it("ignores an incomplete last line", () => {
    const { lines, rest } = splitNdjson('{"type":"a"}\n{"type":"b"}\n{"type":');
    expect(lines).toEqual(['{"type":"a"}', '{"type":"b"}']);
    expect(rest).toBe('{"type":');
  });

  it("extracts MCP servers from tool_call and tool_use shapes", () => {
    const cesShape = JSON.stringify({
      type: "tool_call",
      subtype: "started",
      tool_call: {
        mcpToolCall: { args: { providerIdentifier: "mem0", toolName: "x" } },
      },
    });
    const serverName = JSON.stringify({
      type: "tool_call",
      tool_call: { mcpToolCall: { serverName: "zep-cloud" } },
    });
    const claudeShape = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "mcp__vmem__retrieve" },
          { type: "text" },
        ],
      },
    });
    expect(parseStreamLine(cesShape)?.mcpServers).toEqual(["mem0"]);
    expect(parseStreamLine(serverName)?.mcpServers).toEqual(["zep-cloud"]);
    expect(parseStreamLine(claudeShape)?.mcpServers).toEqual(["vmem"]);
    expect(parseStreamLine("not json")).toBeNull();
  });

  it("reads result events and defaults missing fields to zero", () => {
    const full = parseStreamLine(
      JSON.stringify({
        type: "result",
        result: "ANSWER: x",
        total_cost_usd: 0.02,
        duration_ms: 1500,
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    expect(full?.result).toMatchObject({
      costUsd: 0.02,
      inputTokens: 10,
      durationMs: 1500,
    });
    expect(parseStreamLine('{"type":"result"}')?.result).toMatchObject({
      text: "",
      costUsd: 0,
      outputTokens: 0,
    });
  });
});

describe("guard", () => {
  it("matches fragments as case-insensitive substrings", () => {
    expect(findBannedFragment("My-Mem0-Server", bannedFragments("on"))).toBe(
      "mem0",
    );
    expect(findBannedFragment("filesystem", bannedFragments("on"))).toBeNull();
  });

  it("bans vmem on the off arm only", () => {
    expect(findBannedFragment("vmem", bannedFragments("off"))).toBe("vmem");
    expect(findBannedFragment("vmem", bannedFragments("on"))).toBeNull();
  });

  it("calls the abort callback on a banned server", () => {
    const seen: ContaminationError[] = [];
    const guard = createContaminationGuard("off", (error) => seen.push(error));
    expect(guard(["filesystem"])).toBeNull();
    const violation = guard(["filesystem", "vmem"]);
    expect(violation).toBeInstanceOf(ContaminationError);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.server).toBe("vmem");
  });

  it("keeps MCP tools on the on arm and disables tools on the off arm", async () => {
    const captured: string[][] = [];
    const spawn: SpawnClaude = async (request) => {
      captured.push(request.args);
      return {
        stdout: `${JSON.stringify({ type: "result", result: "ANSWER: x" })}\n`,
        stderr: "",
        exitCode: 0,
        timedOut: false,
        aborted: false,
      };
    };
    await runAgent({
      arm: "on",
      prompt: "q",
      vmemMcpUrl: "https://example.convex.site/mcp",
      timeoutMs: 1000,
      spawn,
    });
    await runAgent({
      arm: "off",
      prompt: "q",
      vmemMcpUrl: "https://example.convex.site/mcp",
      timeoutMs: 1000,
      spawn,
    });
    const onArgs = captured[0] ?? [];
    const offArgs = captured[1] ?? [];
    const toolsIndex = (args: string[]): number => args.indexOf("--tools");
    expect(onArgs).toContain("--strict-mcp-config");
    expect(toolsIndex(onArgs)).toBe(-1);
    expect(offArgs[toolsIndex(offArgs) + 1]).toBe("");
  });

  it("throws ContaminationError from runAgent when a banned server is invoked", async () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "tool_use", name: "mcp__supermemory__search" }],
      },
    });
    const spawn: SpawnClaude = async () => ({
      stdout: `${line}\n`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
      aborted: false,
    });
    await expect(
      runAgent({
        arm: "on",
        prompt: "q",
        vmemMcpUrl: "http://x",
        timeoutMs: 1000,
        spawn,
      }),
    ).rejects.toBeInstanceOf(ContaminationError);
  });
});

describe("answer extraction", () => {
  it("prefers the ANSWER block over preamble", () => {
    const text =
      "I checked memory.\nANSWER: not this\nmore\nANSWER:\nHelix with tokyonight";
    expect(extractAnswer(text)).toBe("Helix with tokyonight");
    expect(extractAnswer("no block here")).toBeNull();
    expect(extractAnswer("**ANSWER:** Helix")).toBe("Helix");
  });
});

describe("judge schema", () => {
  const verdict = {
    score: 75,
    reasoning: "ok",
    factsHit: ["Helix"],
    factsMissed: [],
    abstained: false,
  };

  it("accepts valid scores, bare or wrapped", () => {
    expect(parseJudgeOutput(JSON.stringify(verdict))?.score).toBe(75);
    expect(
      parseJudgeOutput(
        JSON.stringify({ type: "result", structured_output: verdict }),
      )?.score,
    ).toBe(75);
    expect(
      parseJudgeOutput(
        JSON.stringify({ result: JSON.stringify({ ...verdict, score: 100 }) }),
      )?.score,
    ).toBe(100);
  });

  it("fails closed on garbage and off-enum scores", () => {
    expect(parseJudgeOutput("garbage")).toBeNull();
    expect(
      parseJudgeOutput(JSON.stringify({ ...verdict, score: 60 })),
    ).toBeNull();
    expect(
      parseJudgeOutput(JSON.stringify({ ...verdict, extra: 1 })),
    ).toBeNull();
    expect(parseJudgeOutput(JSON.stringify({ score: 50 }))).toBeNull();
  });
});

describe("aggregation", () => {
  it("computes mean, sample stddev, min and max", () => {
    expect(sampleStddev([50, 100])).toBeCloseTo(35.355, 2);
    expect(sampleStddev([75])).toBe(0);
    const summary = summariseArm("on", [
      trial({
        arm: "on",
        score: 50,
        costUsd: 0.1,
        inputTokens: 10,
        outputTokens: 10,
      }),
      trial({
        arm: "on",
        score: 100,
        costUsd: 0.3,
        inputTokens: 30,
        outputTokens: 10,
      }),
      trial({ arm: "on", contaminated: true, error: "x" }),
      trial({ arm: "on", judgeError: true }),
      trial({ arm: "off", score: 0 }),
    ]);
    expect(summary).toMatchObject({
      trials: 4,
      scored: 2,
      meanScore: 75,
      minScore: 50,
      maxScore: 100,
      contaminated: 1,
      judgeErrors: 1,
      agentErrors: 0,
    });
    expect(summary.meanCostUsd).toBeCloseTo(0.1333, 3);
  });
});

describe("seed", () => {
  it("fails closed without credentials", () => {
    expect(() => resolveSeedConfig({})).toThrow(/VMEM_API_KEY/);
  });

  it("posts oldest first with the fixture tag", async () => {
    const fixture = loadFixtures().find((f) => f.id === "stale-vs-updated");
    if (!fixture) throw new Error("fixture missing");
    const bodies: string[] = [];
    const count = await seedFixture(
      { ...fixture, seedMemories: [...fixture.seedMemories].reverse() },
      { siteUrl: "https://x.convex.site", apiKey: "k" },
      async (_url, init) => {
        bodies.push(init.body);
        return { ok: true, status: 200, text: async () => "" };
      },
    );
    expect(count).toBe(2);
    expect(bodies[0]).toContain("Tuesday 10:00 UK time");
    expect(bodies[1]).toContain("e2e-ab:stale-vs-updated");
  });
});

describe("cli args", () => {
  it("parses flags", () => {
    const parsed = parseCliArgs([
      "--dry-run",
      "--repeats",
      "2",
      "--fixture",
      "exact-code",
    ]);
    expect(parsed).toMatchObject({
      dryRun: true,
      repeats: 2,
      fixtureSelectors: ["exact-code"],
    });
    expect(() => parseCliArgs(["--repeats", "0"])).toThrow();
    expect(() => parseCliArgs(["--nope"])).toThrow();
  });
});

describe("runE2eAb", () => {
  it("dry run writes result.json without spawning", async () => {
    const outPath = path.join(tmp, "out", "result.json");
    const result = await runE2eAb({
      dryRun: true,
      repeats: 2,
      outPath,
      env: {},
      spawn: neverSpawn,
      fetch: () => {
        throw new Error("fetch must not be called");
      },
    });
    expect(result.trials).toHaveLength(6 * 2 * 2);
    expect(result.trials.every((t) => t.dryRun && t.score === null)).toBe(true);
    expect(result.delta).toBeNull();
    const written = writtenReportSchema.parse(
      JSON.parse(readFileSync(outPath, "utf8")),
    );
    expect(written.trials).toHaveLength(24);
    expect(written.dryRun).toBe(true);
  });

  it("refuses a live run when the env gate is off", async () => {
    await expect(
      runE2eAb({
        dryRun: false,
        outPath: path.join(tmp, "r.json"),
        env: {},
        spawn: neverSpawn,
      }),
    ).rejects.toThrow(/EVAL_E2E_AB/);
  });

  it("is disabled by default", () => {
    expect(evalE2eAbEnabled({})).toBe(false);
    expect(evalE2eAbEnabled({ EVAL_E2E_AB: "1" })).toBe(true);
  });
});
