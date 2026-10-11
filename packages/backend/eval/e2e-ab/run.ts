import {
  DEFAULT_VMEM_MCP_URL,
  runAgent,
  runJudge,
  spawnClaude,
  type SpawnClaude,
} from "./claude.ts";
import { summariseArm, scoreDelta, summariseFixtures } from "./aggregate.ts";
import { loadFixtures, FIXTURES_DIR, type Fixture } from "./fixture.ts";
import { ContaminationError } from "./guard.ts";
import { buildJudgePrompt, buildTaskPrompt, extractAnswer } from "./prompts.ts";
import { DEFAULT_OUT_PATH, writeResult, type E2eAbResult } from "./report.ts";
import { resolveSeedConfig, seedFixture, type FetchLike } from "./seed.ts";
import { ARMS, type Arm, type Trial } from "./types.ts";

export const EVAL_E2E_AB_ENV = "EVAL_E2E_AB";
const DEFAULT_REPEATS = 3;
const DEFAULT_TIMEOUT_SECONDS = 180;

type Env = Record<string, string | undefined>;

function isTruthy(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function evalE2eAbEnabled(env: Env = process.env): boolean {
  return isTruthy(env[EVAL_E2E_AB_ENV]);
}

export function evalE2eAbDryRun(env: Env = process.env): boolean {
  return isTruthy(env.EVAL_E2E_AB_DRY);
}

export function parsePositiveInt(name: string, raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

function defaultJudgeModel(agentModel: string | null): string {
  return agentModel?.toLowerCase().includes("sonnet") ? "opus" : "sonnet";
}

export interface RunE2eAbOptions {
  dryRun?: boolean;
  repeats?: number;
  fixtureDir?: string;
  fixtureSelectors?: readonly string[];
  outPath?: string;
  model?: string;
  judgeModel?: string;
  timeoutSeconds?: number;
  vmemMcpUrl?: string;
  env?: Env;
  spawn?: SpawnClaude;
  fetch?: FetchLike;
  log?: (message: string) => void;
}

function emptyTrial(
  fixtureId: string,
  arm: Arm,
  repeat: number,
  dryRun: boolean,
): Trial {
  return {
    fixtureId,
    arm,
    repeat,
    dryRun,
    answer: null,
    score: null,
    judge: null,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    contaminated: false,
    judgeError: false,
    error: null,
  };
}

interface TrialContext {
  agentModel: string | null;
  judgeModel: string;
  timeoutMs: number;
  vmemMcpUrl: string;
  spawn: SpawnClaude;
  log: (message: string) => void;
}

async function runLiveTrial(
  fixture: Fixture,
  arm: Arm,
  repeat: number,
  ctx: TrialContext,
): Promise<Trial> {
  const trial = emptyTrial(fixture.id, arm, repeat, false);
  let text: string;
  try {
    const run = await runAgent({
      arm,
      prompt: buildTaskPrompt(fixture),
      model: ctx.agentModel ?? undefined,
      vmemMcpUrl: ctx.vmemMcpUrl,
      timeoutMs: ctx.timeoutMs,
      spawn: ctx.spawn,
    });
    trial.costUsd = run.costUsd;
    trial.inputTokens = run.inputTokens;
    trial.outputTokens = run.outputTokens;
    trial.latencyMs = run.durationMs;
    text = run.text;
  } catch (error) {
    if (error instanceof ContaminationError) {
      ctx.log(`CONTAMINATION ${fixture.id}/${arm}/${repeat}: ${error.message}`);
      return { ...trial, contaminated: true, error: error.message };
    }
    return {
      ...trial,
      error: error instanceof Error ? error.message : "agent failed",
    };
  }

  // The judge sees the ANSWER block only, never the agent's process summary.
  const answer = extractAnswer(text);
  if (answer === null) return { ...trial, error: "missing ANSWER block" };
  trial.answer = answer;

  try {
    const judge = await runJudge({
      prompt: buildJudgePrompt(fixture, answer),
      model: ctx.judgeModel,
      timeoutMs: ctx.timeoutMs,
      spawn: ctx.spawn,
    });
    if (judge === null) return { ...trial, judgeError: true };
    return { ...trial, judge, score: judge.score };
  } catch (error) {
    ctx.log(
      `judge failed ${fixture.id}/${arm}/${repeat}: ${error instanceof Error ? error.message : ""}`,
    );
    return { ...trial, judgeError: true };
  }
}

export async function runE2eAb(
  options: RunE2eAbOptions = {},
): Promise<E2eAbResult> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((message: string) => console.error(message));
  const dryRun = options.dryRun ?? evalE2eAbDryRun(env);
  const repeatsRaw = env.EVAL_E2E_AB_REPEATS;
  const repeats =
    options.repeats ??
    (repeatsRaw
      ? parsePositiveInt("EVAL_E2E_AB_REPEATS", repeatsRaw)
      : DEFAULT_REPEATS);
  const timeoutRaw = env.EVAL_E2E_AB_TIMEOUT_SECONDS;
  const timeoutSeconds =
    options.timeoutSeconds ??
    (timeoutRaw
      ? parsePositiveInt("EVAL_E2E_AB_TIMEOUT_SECONDS", timeoutRaw)
      : DEFAULT_TIMEOUT_SECONDS);
  const agentModel = options.model ?? env.EVAL_E2E_AB_MODEL ?? null;
  const judgeModel =
    options.judgeModel ??
    env.EVAL_E2E_AB_JUDGE_MODEL ??
    defaultJudgeModel(agentModel);
  const fixtures = loadFixtures(
    options.fixtureDir ?? FIXTURES_DIR,
    options.fixtureSelectors,
  );
  const trials: Trial[] = [];

  if (dryRun) {
    // No claude spawn and no HTTP seed. Stub answers only.
    for (const fixture of fixtures) {
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        for (const arm of ARMS) {
          trials.push({
            ...emptyTrial(fixture.id, arm, repeat, true),
            answer: `[dry-run] stub answer for ${fixture.id} (${arm})`,
          });
        }
      }
    }
  } else {
    if (!evalE2eAbEnabled(env)) {
      throw new Error(
        `Live run refused. Set ${EVAL_E2E_AB_ENV}=1 to enable it.`,
      );
    }
    const seedConfig = resolveSeedConfig(env);
    const fetchImpl: FetchLike =
      options.fetch ?? ((url, init) => fetch(url, init));
    const ctx: TrialContext = {
      agentModel,
      judgeModel,
      timeoutMs: timeoutSeconds * 1000,
      vmemMcpUrl:
        options.vmemMcpUrl ?? env.VMEM_MCP_URL ?? DEFAULT_VMEM_MCP_URL,
      spawn: options.spawn ?? spawnClaude,
      log,
    };
    for (const fixture of fixtures) {
      const seeded = await seedFixture(fixture, seedConfig, fetchImpl);
      log(`seeded ${seeded} memories for ${fixture.id}`);
      for (let repeat = 1; repeat <= repeats; repeat += 1) {
        for (const arm of ARMS) {
          const trial = await runLiveTrial(fixture, arm, repeat, ctx);
          log(`${fixture.id}/${arm}/${repeat}: score ${trial.score ?? "—"}`);
          trials.push(trial);
        }
      }
    }
  }

  const off = summariseArm("off", trials);
  const on = summariseArm("on", trials);
  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const result: E2eAbResult = {
    generatedAt: new Date().toISOString(),
    dryRun,
    repeats,
    agentModel,
    judgeModel,
    fixtures: fixtureIds,
    arms: { off, on },
    delta: scoreDelta(off, on),
    byFixture: summariseFixtures(fixtureIds, trials),
    trials,
  };
  writeResult(result, options.outPath ?? DEFAULT_OUT_PATH);
  return result;
}
