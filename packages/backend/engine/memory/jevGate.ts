import type { MemoryCandidate } from "@vmem/sdk";
import { truncateAtWord } from "../llm/truncateAtWord";
import {
  evaluateSystemOne,
  type EvaluateSystemOneArgs,
  type SystemOneQuestion,
  type SystemOneResponse,
} from "../llm/systemOneClient";

// TODO(GLiNER): on-write JointIE / span extraction is a separate P0.
// Hosting (sidecar vs API) is still the blocker. Do not call GLiNER at
// retrieve time. Research brief: https://github.com/vvedantb/vmem/pull/181
// (`packages/backend/tests/memory/extraction-research-gliner-jev.md`).

export const JEV_GATE_HEAD = 20;
// Live smoke (Convex vmem query): keep 0.66 vs drop 0.03. 0.7 would drop gold.
export const DEFAULT_JEV_RELEVANCE_THRESHOLD = 0.5;
const JEV_HIT_CONTENT_CHARS = 500;
export const JEV_BEST_NONE = "none";
export const JEV_SCORE_CRITERIA = [
  "irrelevant",
  "weakly related",
  "directly answers",
] as const;

const KEEP_INSTRUCTIONS =
  "Keep this memory as an answer to the query (not a lexical trap)?";
const SCORE_INSTRUCTIONS = "How well does this memory answer the query?";
const BEST_INSTRUCTIONS =
  "Which memory is the single best answer to the query? Pick none if none are relevant.";

export type RetrieveJudgeOptions = {
  judge?: "jev" | "off";
  rerank?: boolean | "jev";
};

/** Default on. `judge: "off"` is ablation-only. `judge: "jev"` / `rerank: "jev"` are accepted no-ops. */
export function wantsJevJudge(options: RetrieveJudgeOptions): boolean {
  return options.judge !== "off";
}

/** #179 local top-20 extra. Skipped when the Jev gate will actually run. */
export function wantsLocalRerank(
  options: RetrieveJudgeOptions,
  jevActive: boolean = wantsJevJudge(options),
): boolean {
  return options.rerank === true && !jevActive;
}

export function jevRankPoolLimit(userLimit: number, jev: boolean): number {
  if (!jev) return userLimit;
  return Math.max(userLimit, JEV_GATE_HEAD);
}

function relevantKey(index: number): string {
  return `rel_${String(index)}`;
}

function scoreKey(index: number): string {
  return `sc_${String(index)}`;
}

function hitOptionKey(index: number): string {
  return `h${String(index)}`;
}

function noulForIndex(
  answers: SystemOneResponse["answers"],
  index: number,
): number | undefined {
  const answer = answers[relevantKey(index)];
  if (answer === undefined || answer.type !== "noul") return undefined;
  return answer.noul;
}

function scoreForIndex(
  answers: SystemOneResponse["answers"],
  index: number,
): { score: number; confidence: number } | undefined {
  const answer = answers[scoreKey(index)];
  if (answer === undefined || answer.type !== "score") return undefined;
  return { score: answer.score, confidence: answer.confidence };
}

function bestHitIndex(
  answers: SystemOneResponse["answers"],
  hitCount: number,
): number | undefined {
  const answer = answers.best;
  if (answer === undefined || answer.type !== "choice") return undefined;
  if (answer.choice === JEV_BEST_NONE) return undefined;
  for (let i = 0; i < hitCount; i += 1) {
    if (answer.choice === hitOptionKey(i)) return i;
  }
  return undefined;
}

function choiceConfidence(
  answers: SystemOneResponse["answers"],
): number | undefined {
  const answer = answers.best;
  if (answer === undefined || answer.type !== "choice") return undefined;
  return answer.confidence;
}

function appendJevReason(reason: string, noul: number | undefined): string {
  if (noul === undefined) return reason;
  if (reason.includes("Jev relevant")) return reason;
  return `${reason}; Jev relevant`;
}

function annotateHit(
  hit: MemoryCandidate,
  noul: number | undefined,
  jevScore: { score: number; confidence: number } | undefined,
  isBest: boolean,
  bestConfidence: number | undefined,
): MemoryCandidate {
  return {
    ...hit,
    trace: {
      ...hit.trace,
      reason: appendJevReason(hit.trace.reason, noul),
      scoreBreakdown: {
        ...hit.trace.scoreBreakdown,
        ...(noul === undefined
          ? {}
          : { jevRelevant: noul, jevConfidence: noul }),
        ...(jevScore === undefined ? {} : { jevScore: jevScore.score }),
        ...(isBest
          ? {
              jevBest: true,
              ...(bestConfidence === undefined
                ? {}
                : { jevConfidence: bestConfidence }),
            }
          : {}),
      },
    },
  };
}

export function buildJevRetrieveQuestions(
  hits: readonly MemoryCandidate[],
): Record<string, SystemOneQuestion> {
  const questions: Record<string, SystemOneQuestion> = {};
  const choiceCriteria: Record<string, string | null> = {
    [JEV_BEST_NONE]: "None of the memories correctly answer the query",
  };
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (hit === undefined) continue;
    questions[relevantKey(i)] = {
      type: "noul",
      instructions: KEEP_INSTRUCTIONS,
      criteria: {
        true: "The memory actually answers the query; shared keywords are not enough",
        false: "Lexical overlap, wrong sense, stale, or unrelated",
      },
    };
    questions[scoreKey(i)] = {
      type: "score",
      instructions: SCORE_INSTRUCTIONS,
      criteria: [...JEV_SCORE_CRITERIA],
    };
    choiceCriteria[hitOptionKey(i)] = `${hit.title}: ${truncateAtWord(
      hit.content,
      160,
    )}`;
  }
  questions.best = {
    type: "choice",
    instructions: BEST_INSTRUCTIONS,
    criteria: choiceCriteria,
  };
  return questions;
}

function buildJevRetrieveState(
  query: string,
  hits: readonly MemoryCandidate[],
  referenceDate: string | undefined,
): {
  query: string;
  referenceDate: string | null;
  hits: Array<{
    id: string;
    title: string;
    content: string;
    type: string;
    temporalKind: string | null;
    eventStart: string | null;
    eventEnd: string | null;
    hybridScore: number;
  }>;
} {
  return {
    query,
    referenceDate: referenceDate ?? null,
    hits: hits.map((hit) => ({
      id: hit.id,
      title: hit.title,
      content: truncateAtWord(hit.content, JEV_HIT_CONTENT_CHARS),
      type: hit.type,
      temporalKind: hit.temporalKind ?? null,
      eventStart: hit.eventStart ?? null,
      eventEnd: hit.eventEnd ?? null,
      hybridScore: hit.trace.score,
    })),
  };
}

function compareKept(a: MemoryCandidate, b: MemoryCandidate): number {
  const aScore = a.trace.scoreBreakdown.jevScore;
  const bScore = b.trace.scoreBreakdown.jevScore;
  if (aScore !== bScore) {
    if (aScore === undefined) return 1;
    if (bScore === undefined) return -1;
    return bScore - aScore;
  }
  const aJev = a.trace.scoreBreakdown.jevRelevant;
  const bJev = b.trace.scoreBreakdown.jevRelevant;
  if (aJev !== bJev) {
    if (aJev === undefined) return 1;
    if (bJev === undefined) return -1;
    return bJev - aJev;
  }
  return b.trace.score - a.trace.score;
}

function applyAnswers(
  hits: readonly MemoryCandidate[],
  response: SystemOneResponse,
  threshold: number,
): MemoryCandidate[] {
  const head = hits.slice(0, JEV_GATE_HEAD);
  const tail = hits.slice(JEV_GATE_HEAD);
  const bestIndex = bestHitIndex(response.answers, head.length);
  const bestConf = choiceConfidence(response.answers);
  const kept: MemoryCandidate[] = [];
  for (let i = 0; i < head.length; i += 1) {
    const hit = head[i];
    if (hit === undefined) continue;
    const noul = noulForIndex(response.answers, i);
    if (noul !== undefined && noul < threshold) continue;
    kept.push(
      annotateHit(
        hit,
        noul,
        scoreForIndex(response.answers, i),
        bestIndex === i,
        bestConf,
      ),
    );
  }
  kept.sort(compareKept);
  if (bestIndex !== undefined) {
    const bestHit = head[bestIndex];
    if (bestHit !== undefined) {
      const idx = kept.findIndex((row) => row.id === bestHit.id);
      if (idx > 0) {
        const [best] = kept.splice(idx, 1);
        if (best !== undefined) kept.unshift(best);
      }
    }
  }
  return [...kept, ...tail];
}

export async function applyJevRetrieveGate(args: {
  query: string;
  hits: readonly MemoryCandidate[];
  apiKey: string;
  referenceDate?: string;
  limit?: number;
  threshold?: number;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<MemoryCandidate[]> {
  const limit = args.limit ?? args.hits.length;
  const original = [...args.hits];
  if (args.query.trim().length === 0 || args.hits.length === 0) {
    return original.slice(0, Math.max(0, limit));
  }
  const threshold = args.threshold ?? DEFAULT_JEV_RELEVANCE_THRESHOLD;
  const head = args.hits.slice(0, JEV_GATE_HEAD);
  const evaluate = args.evaluate ?? evaluateSystemOne;
  try {
    const response = await evaluate({
      apiKey: args.apiKey,
      state: buildJevRetrieveState(args.query, head, args.referenceDate),
      questions: buildJevRetrieveQuestions(head),
    });
    return applyAnswers(args.hits, response, threshold).slice(
      0,
      Math.max(0, limit),
    );
  } catch {
    return original.slice(0, Math.max(0, limit));
  }
}
