import {
  generateBenchmarkCorpus,
  type BenchmarkCorpus,
  type BenchmarkMemory,
  type RetrievalEvalQuery,
} from "../../../eval/corpus";

interface CompetitiveCorpusOptions {
  queryLimit?: number;
  memoryLimit?: number;
}

function goldTitles(queries: readonly RetrievalEvalQuery[]): Set<string> {
  const titles = new Set<string>();
  for (const query of queries) {
    for (const title of Object.keys(query.relevance)) {
      titles.add(title);
    }
  }
  return titles;
}

export function subsetLabelledCorpus(
  corpus: BenchmarkCorpus,
  options: CompetitiveCorpusOptions = {},
): BenchmarkCorpus {
  const queries =
    options.queryLimit === undefined
      ? corpus.queries
      : corpus.queries.slice(0, options.queryLimit);
  if (options.memoryLimit === undefined) {
    return {
      memories: corpus.memories,
      relationships: corpus.relationships,
      queries,
    };
  }
  const required = goldTitles(queries);
  const kept: BenchmarkMemory[] = [];
  const seen = new Set<string>();
  for (const memory of corpus.memories) {
    if (!required.has(memory.title)) continue;
    kept.push(memory);
    seen.add(memory.id);
  }
  for (const memory of corpus.memories) {
    if (kept.length >= options.memoryLimit) break;
    if (seen.has(memory.id)) continue;
    kept.push(memory);
    seen.add(memory.id);
  }
  const ids = new Set(kept.map((memory) => memory.id));
  return {
    memories: kept,
    relationships: corpus.relationships.filter(
      (rel) => ids.has(rel.sourceId) && ids.has(rel.targetId),
    ),
    queries,
  };
}

export function loadCompetitiveCorpus(
  options: CompetitiveCorpusOptions = {},
): BenchmarkCorpus {
  return subsetLabelledCorpus(generateBenchmarkCorpus(), options);
}

export function labelledDocumentText(memory: BenchmarkMemory): string {
  return `${memory.title}\n\n${memory.content}`;
}

export function answerableQueries(
  corpus: BenchmarkCorpus,
): RetrievalEvalQuery[] {
  return corpus.queries.filter((query) => query.expectedTitles.length > 0);
}

export function abstentionQueries(
  corpus: BenchmarkCorpus,
): RetrievalEvalQuery[] {
  return corpus.queries.filter((query) => query.expectedTitles.length === 0);
}
