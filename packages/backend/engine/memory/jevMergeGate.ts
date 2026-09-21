import { truncateAtWord } from "../llm/truncateAtWord";
import {
  evaluateSystemOne,
  type EvaluateSystemOneArgs,
  type SystemOneQuestion,
  type SystemOneResponse,
} from "../llm/systemOneClient";
import { JEV_BEST_NONE } from "./jevGate";

const JEV_MEMORY_CONTENT_CHARS = 500;
const JEV_MEMORY_CRITERIA_CHARS = 160;

/** Noul at or above this → create a merge proposal. */
export const JEV_MERGE_APPROVE_NOUL = 0.65;
/** Noul at or below this → skip (confident not a merge). */
export const JEV_MERGE_REJECT_NOUL = 0.35;
/** Honor Jev's keeper over `pickClusterKeeper` when choice confidence is at least this. */
export const JEV_KEEPER_OVERRIDE_CONFIDENCE = 0.6;
/** When `autoAccept` is true, require this noul before materializing without inbox review. */
export const JEV_AUTO_ACCEPT_NOUL = 0.7;

export type MergeGateMemory = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
};

export type JevMergeGateOutcome =
  | "approve"
  | "reject"
  | "abstain"
  | "fail-open";

export interface JevMergeGateDecision {
  sourceMemoryIds: string[];
  outcome: JevMergeGateOutcome;
  keeperId: string;
  safeToAutoAccept: boolean;
  mergeNoul?: number;
  keeperConfidence?: number;
  autoAcceptNoul?: number;
}

function hitOptionKey(index: number): string {
  return `h${String(index)}`;
}

export function clusterSourceKey(ids: readonly string[]): string {
  return [...ids].sort().join("\0");
}

export function failOpenMergeDecision(args: {
  sourceMemoryIds: readonly string[];
  heuristicKeeperId: string;
  autoAccept: boolean;
}): JevMergeGateDecision {
  return {
    sourceMemoryIds: [...args.sourceMemoryIds],
    outcome: "fail-open",
    keeperId: args.heuristicKeeperId,
    safeToAutoAccept: args.autoAccept,
  };
}

function noulAnswer(
  answers: SystemOneResponse["answers"],
  key: string,
): number | undefined {
  const answer = answers[key];
  if (answer === undefined || answer.type !== "noul") return undefined;
  return answer.noul;
}

function keeperChoice(
  answers: SystemOneResponse["answers"],
  memories: readonly MergeGateMemory[],
): { keeperId: string | undefined; confidence: number | undefined } {
  const answer = answers.keeper;
  if (answer === undefined || answer.type !== "choice") {
    return { keeperId: undefined, confidence: undefined };
  }
  if (answer.choice === JEV_BEST_NONE) {
    return { keeperId: undefined, confidence: answer.confidence };
  }
  for (let i = 0; i < memories.length; i += 1) {
    const memory = memories[i];
    if (memory === undefined) continue;
    if (answer.choice === hitOptionKey(i)) {
      return { keeperId: memory.id, confidence: answer.confidence };
    }
  }
  return { keeperId: undefined, confidence: answer.confidence };
}

function mergeOutcome(noul: number | undefined): JevMergeGateOutcome {
  if (noul === undefined) return "fail-open";
  if (noul >= JEV_MERGE_APPROVE_NOUL) return "approve";
  if (noul <= JEV_MERGE_REJECT_NOUL) return "reject";
  return "abstain";
}

export function buildJevMergeQuestions(
  memories: readonly MergeGateMemory[],
): Record<string, SystemOneQuestion> {
  const choiceCriteria: Record<string, string | null> = {
    [JEV_BEST_NONE]:
      "None is clearly the current truth; do not override the heuristic keeper",
  };
  for (let i = 0; i < memories.length; i += 1) {
    const memory = memories[i];
    if (memory === undefined) continue;
    choiceCriteria[hitOptionKey(i)] = `${memory.title}: ${truncateAtWord(
      memory.content,
      JEV_MEMORY_CRITERIA_CHARS,
    )}`;
  }
  return {
    merge: {
      type: "noul",
      instructions:
        "Are these memories true near-duplicates of the same fact, worth merging into one record?",
      criteria: {
        true: "Same fact or current truth vs a stale copy; merging would not drop a distinct belief",
        false: "Different facts, different time windows, or only lexical overlap",
      },
    },
    keeper: {
      type: "choice",
      instructions:
        "Which memory is the current truth / best keeper to retain?",
      criteria: choiceCriteria,
    },
    auto_accept: {
      type: "noul",
      instructions:
        "Is it safe to auto-accept this merge without a human reviewing the inbox?",
      criteria: {
        true: "Exact or near-exact duplicate; keeper is obvious; no conflicting details",
        false: "Details differ, dates conflict, or a human should review",
      },
    },
  };
}

function buildJevMergeState(
  memories: readonly MergeGateMemory[],
  heuristicKeeperId: string,
): {
  task: "near-duplicate-merge";
  heuristicKeeperId: string;
  memories: Array<{
    id: string;
    title: string;
    content: string;
    updatedAt: string;
  }>;
} {
  return {
    task: "near-duplicate-merge",
    heuristicKeeperId,
    memories: memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      content: truncateAtWord(memory.content, JEV_MEMORY_CONTENT_CHARS),
      updatedAt: memory.updatedAt,
    })),
  };
}

function applyMergeAnswers(
  memories: readonly MergeGateMemory[],
  heuristicKeeperId: string,
  autoAccept: boolean,
  response: SystemOneResponse,
): JevMergeGateDecision {
  const sourceMemoryIds = memories.map((memory) => memory.id);
  const mergeNoul = noulAnswer(response.answers, "merge");
  const outcome = mergeOutcome(mergeNoul);
  if (outcome === "fail-open") {
    return failOpenMergeDecision({
      sourceMemoryIds,
      heuristicKeeperId,
      autoAccept,
    });
  }
  const choice = keeperChoice(response.answers, memories);
  const honorKeeper =
    outcome === "approve" &&
    choice.keeperId !== undefined &&
    (choice.confidence ?? 0) >= JEV_KEEPER_OVERRIDE_CONFIDENCE;
  const keeperId = honorKeeper
    ? (choice.keeperId ?? heuristicKeeperId)
    : heuristicKeeperId;
  const autoAcceptNoul = noulAnswer(response.answers, "auto_accept");
  const safeToAutoAccept =
    autoAccept &&
    outcome === "approve" &&
    autoAcceptNoul !== undefined &&
    autoAcceptNoul >= JEV_AUTO_ACCEPT_NOUL;
  return {
    sourceMemoryIds,
    outcome,
    keeperId,
    safeToAutoAccept,
    mergeNoul,
    keeperConfidence: choice.confidence,
    autoAcceptNoul,
  };
}

export async function applyJevMergeGate(args: {
  memories: readonly MergeGateMemory[];
  heuristicKeeperId: string;
  autoAccept: boolean;
  apiKey: string;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<JevMergeGateDecision> {
  const sourceMemoryIds = args.memories.map((memory) => memory.id);
  const fallback = failOpenMergeDecision({
    sourceMemoryIds,
    heuristicKeeperId: args.heuristicKeeperId,
    autoAccept: args.autoAccept,
  });
  if (args.memories.length < 2) return fallback;
  const evaluate = args.evaluate ?? evaluateSystemOne;
  try {
    const response = await evaluate({
      apiKey: args.apiKey,
      state: buildJevMergeState(args.memories, args.heuristicKeeperId),
      questions: buildJevMergeQuestions(args.memories),
    });
    return applyMergeAnswers(
      args.memories,
      args.heuristicKeeperId,
      args.autoAccept,
      response,
    );
  } catch {
    return fallback;
  }
}

export async function judgeDreamMergeClusters(args: {
  clusters: ReadonlyArray<{
    memories: readonly MergeGateMemory[];
    heuristicKeeperId: string;
  }>;
  autoAccept: boolean;
  apiKey: string | undefined;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<JevMergeGateDecision[]> {
  const decisions: JevMergeGateDecision[] = [];
  for (const cluster of args.clusters) {
    const sourceMemoryIds = cluster.memories.map((memory) => memory.id);
    if (args.apiKey === undefined) {
      decisions.push(
        failOpenMergeDecision({
          sourceMemoryIds,
          heuristicKeeperId: cluster.heuristicKeeperId,
          autoAccept: args.autoAccept,
        }),
      );
      continue;
    }
    decisions.push(
      await applyJevMergeGate({
        memories: cluster.memories,
        heuristicKeeperId: cluster.heuristicKeeperId,
        autoAccept: args.autoAccept,
        apiKey: args.apiKey,
        evaluate: args.evaluate,
      }),
    );
  }
  return decisions;
}
