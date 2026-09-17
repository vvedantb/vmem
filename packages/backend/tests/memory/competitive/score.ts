import type { RetrievalEvalQuery } from "../../../eval/corpus";
import {
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "../../../eval/metrics";
import { EVAL_K } from "../../../eval/retrieve";
import type { QueryOutcome } from "../../../eval/benchmark";

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function outcomeFromTitles(args: {
  query: RetrievalEvalQuery;
  titles: readonly string[];
  texts?: readonly string[];
  latencyMs: number;
  topScore?: number;
}): QueryOutcome {
  const titles = [...args.titles];
  return {
    type: args.query.type,
    query: args.query.query,
    titles,
    recall1: recallAtK(titles, args.query.expectedTitles, 1),
    recall3: recallAtK(titles, args.query.expectedTitles, 3),
    recall5: recallAtK(titles, args.query.expectedTitles, 5),
    recall10: recallAtK(titles, args.query.expectedTitles, 10),
    precision5: precisionAtK(titles, args.query.expectedTitles, 5),
    rr: reciprocalRank(titles, args.query.expectedTitles),
    ndcg10: ndcgAtK(
      titles,
      new Map(Object.entries(args.query.relevance)),
      EVAL_K,
    ),
    ctxTokens: (args.texts ?? titles).reduce(
      (sum, text) => sum + approxTokens(text),
      0,
    ),
    latencyMs: args.latencyMs,
    topScore: args.topScore ?? 0,
    jevFailOpen: false,
    empty: titles.length === 0,
  };
}
