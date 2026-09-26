import { truncateAtWord } from "../llm/truncateAtWord";
import {
  evaluateSystemOne,
  type EvaluateSystemOneArgs,
  type SystemOneQuestion,
  type SystemOneResponse,
} from "../llm/systemOneClient";
import type { MemoryWithTags } from "@vmem/sdk";
import {
  appendJevExplain,
  JEV_BEST_NONE,
  JEV_GATE_HEAD,
  JEV_SCORE_CRITERIA,
  type JevItemScore,
} from "./jevGate";
import type { RelatedMemoryHit } from "./rank";

// Generic Jev rerank for non-retrieve surfaces (related memories, wiki search).
// Order + explain only: every input item comes back, whatever Jev says.

const JEV_ITEM_CONTENT_CHARS = 500;
const JEV_ITEM_CRITERIA_CHARS = 160;

export type JevRankItem = {
  id: string;
  title: string;
  content: string;
};

export type JevRankResult<T> = {
  source: "jev" | "fail-open";
  items: T[];
  scores: Map<string, JevItemScore>;
};

function relevantKey(index: number): string {
  return `rel_${String(index)}`;
}

function scoreKey(index: number): string {
  return `sc_${String(index)}`;
}

function hitOptionKey(index: number): string {
  return `h${String(index)}`;
}

export function buildJevRankQuestions(
  items: readonly JevRankItem[],
  subject: string,
): Record<string, SystemOneQuestion> {
  const questions: Record<string, SystemOneQuestion> = {};
  const choiceCriteria: Record<string, string | null> = {
    [JEV_BEST_NONE]: `None of the ${subject} items fit the query`,
  };
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    questions[relevantKey(i)] = {
      type: "noul",
      instructions: `Is this ${subject} genuinely relevant to the query (not just shared keywords)?`,
      criteria: {
        true: "Clearly about the same subject or answers the query",
        false: "Lexical overlap only, wrong sense, or unrelated",
      },
    };
    questions[scoreKey(i)] = {
      type: "score",
      instructions: `How relevant is this ${subject} to the query?`,
      criteria: [...JEV_SCORE_CRITERIA],
    };
    choiceCriteria[hitOptionKey(i)] = `${item.title}: ${truncateAtWord(
      item.content,
      JEV_ITEM_CRITERIA_CHARS,
    )}`;
  }
  questions.best = {
    type: "choice",
    instructions: `Which ${subject} is the single best fit for the query? Pick none if none fit.`,
    criteria: choiceCriteria,
  };
  return questions;
}

function readScores(
  answers: SystemOneResponse["answers"],
  count: number,
): JevItemScore[] {
  const best = answers.best;
  const bestChoice =
    best !== undefined && best.type === "choice" ? best.choice : undefined;
  const scores: JevItemScore[] = [];
  for (let i = 0; i < count; i += 1) {
    const rel = answers[relevantKey(i)];
    const sc = answers[scoreKey(i)];
    scores.push({
      ...(rel?.type === "noul" ? { jevRelevant: rel.noul } : {}),
      ...(sc?.type === "score" ? { jevScore: sc.score } : {}),
      ...(bestChoice === hitOptionKey(i) ? { jevBest: true } : {}),
    });
  }
  return scores;
}

function hasSignal(score: JevItemScore): boolean {
  return (
    score.jevRelevant !== undefined ||
    score.jevScore !== undefined ||
    score.jevBest === true
  );
}

function compareOptional(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return b - a;
}

/**
 * Rerank the first `JEV_GATE_HEAD` items with Jev; the tail keeps its order.
 * Fail-open: no key, empty query, error, timeout, or junk answers return the
 * input order unchanged. Never drops an item.
 */
export async function jevRankItems<T>(args: {
  query: string;
  items: readonly T[];
  toItem: (item: T) => JevRankItem;
  subject: string;
  task: string;
  apiKey: string | undefined;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<JevRankResult<T>> {
  const original: JevRankResult<T> = {
    source: "fail-open",
    items: [...args.items],
    scores: new Map(),
  };
  if (
    args.apiKey === undefined ||
    args.query.trim().length === 0 ||
    args.items.length === 0
  ) {
    return original;
  }
  const head = args.items.slice(0, JEV_GATE_HEAD);
  const tail = args.items.slice(JEV_GATE_HEAD);
  const described = head.map(args.toItem);
  const evaluate = args.evaluate ?? evaluateSystemOne;
  let response: SystemOneResponse;
  try {
    response = await evaluate({
      apiKey: args.apiKey,
      state: {
        task: args.task,
        query: args.query,
        items: described.map((item) => ({
          id: item.id,
          title: item.title,
          content: truncateAtWord(item.content, JEV_ITEM_CONTENT_CHARS),
        })),
      },
      questions: buildJevRankQuestions(described, args.subject),
      tag: args.task,
    });
  } catch {
    return original;
  }
  const scores = readScores(response.answers, head.length);
  if (!scores.some(hasSignal)) return original;

  const order = head.map((item, index) => ({ item, index }));
  order.sort((a, b) => {
    const sa = scores[a.index] ?? {};
    const sb = scores[b.index] ?? {};
    if (sa.jevBest !== sb.jevBest) return sa.jevBest === true ? -1 : 1;
    return (
      compareOptional(sa.jevScore, sb.jevScore) ||
      compareOptional(sa.jevRelevant, sb.jevRelevant) ||
      a.index - b.index
    );
  });
  const byId = new Map<string, JevItemScore>();
  for (let i = 0; i < described.length; i += 1) {
    const item = described[i];
    const score = scores[i];
    if (item !== undefined && score !== undefined && hasSignal(score)) {
      byId.set(item.id, score);
    }
  }
  return {
    source: "jev",
    items: [...order.map((row) => row.item), ...tail],
    scores: byId,
  };
}

/** Related-memories panel / `memory_related`: seed memory is the query. */
export async function jevRankRelatedMemories(args: {
  seed: { title: string; content: string };
  hits: readonly RelatedMemoryHit[];
  limit: number;
  apiKey: string | undefined;
  evaluate?: (args: EvaluateSystemOneArgs) => Promise<SystemOneResponse>;
}): Promise<Array<{ memory: MemoryWithTags; reason: string }>> {
  const ranked = await jevRankItems({
    query: `${args.seed.title}: ${truncateAtWord(args.seed.content, JEV_ITEM_CONTENT_CHARS)}`,
    items: args.hits,
    toItem: (hit) => ({
      id: hit.memory.id,
      title: hit.memory.title,
      content: hit.memory.content,
    }),
    subject: "memory",
    task: "related-memories",
    apiKey: args.apiKey,
    evaluate: args.evaluate,
  });
  return ranked.items.slice(0, Math.max(0, args.limit)).map((hit) => ({
    memory: hit.memory,
    reason: appendJevExplain(hit.reason, ranked.scores.get(hit.memory.id)),
  }));
}
