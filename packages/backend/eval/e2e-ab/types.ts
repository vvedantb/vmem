export type Arm = "off" | "on";

export const ARMS: readonly Arm[] = ["off", "on"];

export type JudgeScore = 0 | 25 | 50 | 75 | 100;

export interface JudgeResult {
  score: JudgeScore;
  reasoning: string;
  factsHit: string[];
  factsMissed: string[];
  abstained: boolean;
}

export interface Trial {
  fixtureId: string;
  arm: Arm;
  repeat: number;
  dryRun: boolean;
  answer: string | null;
  // null when not judged (dry run, agent error, contamination, judge error)
  score: JudgeScore | null;
  judge: JudgeResult | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  contaminated: boolean;
  judgeError: boolean;
  // agent failure (timeout, non-zero exit, missing ANSWER block) or contamination detail
  error: string | null;
}
