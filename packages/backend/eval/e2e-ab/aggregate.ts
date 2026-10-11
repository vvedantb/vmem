import { mean } from "../metrics.ts";
import type { Arm, Trial } from "./types.ts";

export interface ArmSummary {
  arm: Arm;
  trials: number;
  // Trials with a judge score. Only these feed the score statistics.
  scored: number;
  meanScore: number;
  stddev: number;
  minScore: number;
  maxScore: number;
  meanCostUsd: number;
  meanTokens: number;
  meanLatencyMs: number;
  contaminated: number;
  judgeErrors: number;
  agentErrors: number;
}

// sample standard deviation (n - 1); 0 when n < 2
export function sampleStddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sumSquares = values.reduce((sum, value) => sum + (value - m) ** 2, 0);
  return Math.sqrt(sumSquares / (values.length - 1));
}

export function summariseArm(arm: Arm, trials: readonly Trial[]): ArmSummary {
  const own = trials.filter((trial) => trial.arm === arm);
  const scores = own.flatMap((trial) =>
    trial.score === null ? [] : [trial.score],
  );
  // Cost, tokens and latency come from trials where the agent ran to the end.
  const ran = own.filter(
    (trial) => !trial.contaminated && trial.error === null,
  );
  return {
    arm,
    trials: own.length,
    scored: scores.length,
    meanScore: mean(scores),
    stddev: sampleStddev(scores),
    minScore: scores.length > 0 ? Math.min(...scores) : 0,
    maxScore: scores.length > 0 ? Math.max(...scores) : 0,
    meanCostUsd: mean(ran.map((trial) => trial.costUsd)),
    meanTokens: mean(
      ran.map((trial) => trial.inputTokens + trial.outputTokens),
    ),
    meanLatencyMs: mean(ran.map((trial) => trial.latencyMs)),
    contaminated: own.filter((trial) => trial.contaminated).length,
    judgeErrors: own.filter((trial) => trial.judgeError).length,
    agentErrors: own.filter(
      (trial) => !trial.contaminated && trial.error !== null,
    ).length,
  };
}

// on mean minus off mean; null unless both arms have scored trials
export function scoreDelta(off: ArmSummary, on: ArmSummary): number | null {
  return off.scored > 0 && on.scored > 0 ? on.meanScore - off.meanScore : null;
}

export interface FixtureSummary {
  fixtureId: string;
  offMean: number | null;
  onMean: number | null;
  delta: number | null;
}

function scoredMean(
  trials: readonly Trial[],
  fixtureId: string,
  arm: Arm,
): number | null {
  const scores = trials.flatMap((trial) =>
    trial.fixtureId === fixtureId && trial.arm === arm && trial.score !== null
      ? [trial.score]
      : [],
  );
  return scores.length > 0 ? mean(scores) : null;
}

export function summariseFixtures(
  fixtureIds: readonly string[],
  trials: readonly Trial[],
): FixtureSummary[] {
  return fixtureIds.map((fixtureId) => {
    const offMean = scoredMean(trials, fixtureId, "off");
    const onMean = scoredMean(trials, fixtureId, "on");
    return {
      fixtureId,
      offMean,
      onMean,
      delta: offMean !== null && onMean !== null ? onMean - offMean : null,
    };
  });
}
