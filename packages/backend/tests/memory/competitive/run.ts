import { aggregate, runCorpusAblation } from "../../../eval/benchmark";
import { embeddingMode } from "../../../eval/embeddings";
import { EVAL_K } from "../../../eval/retrieve";
import type { BenchmarkCorpus } from "../../../eval/corpus";
import {
  abstentionQueries,
  answerableQueries,
  loadCompetitiveCorpus,
} from "./corpus";
import {
  EVAL_COMPETITIVE_KEYS_REQUIRED,
  missingVendorKeyNames,
  readMem0ApiKey,
  readOptionalJevKey,
  readPositiveIntEnv,
  readSupermemoryApiKey,
  requireVendorKeys,
  skipIngest,
  vendorProductDefaults,
} from "./keys";
import { ingestMem0, retrieveMem0Titles } from "./mem0";
import { competitiveLiveReport, type SystemRow } from "./report";
import { outcomeFromTitles } from "./score";
import { ingestSuperMemory, retrieveSuperMemoryTitles } from "./supermemory";

const HYBRID_NAME = "vmem hybrid-only";
const JEV_NAME = "vmem default Jev-rerank";
const MEM0_NAME = "Mem0 Platform";
const SUPERMEMORY_NAME = "SuperMemory";

interface CompetitiveRunOptions {
  env?: Record<string, string | undefined>;
  requireVendors?: boolean;
  fetchImpl?: typeof fetch;
}

function corpusFromEnv(
  env: Record<string, string | undefined>,
): BenchmarkCorpus {
  return loadCompetitiveCorpus({
    queryLimit: readPositiveIntEnv("COMPETITIVE_QUERY_LIMIT", env),
    memoryLimit: readPositiveIntEnv("COMPETITIVE_MEMORY_LIMIT", env),
  });
}

async function vendorOutcomes(args: {
  corpus: BenchmarkCorpus;
  retrieve: (
    query: string,
  ) => Promise<{ titles: string[]; latencyMs: number; texts: string[] }>;
}): Promise<ReturnType<typeof outcomeFromTitles>[]> {
  const outcomes: ReturnType<typeof outcomeFromTitles>[] = [];
  for (const query of args.corpus.queries) {
    const retrieved = await args.retrieve(query.query);
    if (query.expectedTitles.length === 0) continue;
    outcomes.push(
      outcomeFromTitles({
        query,
        titles: retrieved.titles,
        texts: retrieved.texts,
        latencyMs: retrieved.latencyMs,
      }),
    );
  }
  return outcomes;
}

async function runVmemRows(
  corpus: BenchmarkCorpus,
  jevKey: string | undefined,
): Promise<SystemRow[]> {
  const runJev = jevKey !== undefined;
  const { runs } = await runCorpusAblation(corpus, {
    configs: [
      { name: HYBRID_NAME, legs: {}, judge: "off" },
      ...(runJev ? [{ name: JEV_NAME, legs: {} }] : []),
    ],
    jevDefaultOn: runJev,
    requireJevKey: runJev,
    apiKey: jevKey,
  });
  const rows: SystemRow[] = [];
  for (const name of [HYBRID_NAME, JEV_NAME]) {
    const run = runs.find((row) => row.name === name);
    if (run === undefined) {
      if (name === JEV_NAME) {
        rows.push({
          status: "missing",
          name: JEV_NAME,
          reason:
            "TODO: TYPESAFE_API_KEY (rerank-only after #187; do not copy pre-#187 hard-drop 84.6% R@5)",
        });
      }
      continue;
    }
    rows.push({
      status: "ok",
      name,
      metrics: aggregate(run.outcomes),
      notes:
        name === HYBRID_NAME
          ? `local harness · ${embeddingMode()} embeddings · judge off`
          : "live System One jev-latest · rerank only (no noul hard-drop)",
    });
  }
  return rows;
}

export async function runCompetitive(
  options: CompetitiveRunOptions = {},
): Promise<{ report: string; rows: SystemRow[] }> {
  const env = options.env ?? process.env;
  if (options.requireVendors === true) {
    requireVendorKeys(env);
  }
  const corpus = corpusFromEnv(env);
  const answerable = answerableQueries(corpus);
  const abstention = abstentionQueries(corpus);
  const mem0Key = readMem0ApiKey(env);
  const smKey = readSupermemoryApiKey(env);
  const jevKey = readOptionalJevKey(env);
  const rows: SystemRow[] = [];
  rows.push(...(await runVmemRows(corpus, jevKey)));

  const threshold = vendorProductDefaults(env) ? undefined : 0;
  const doIngest = !skipIngest(env);

  if (mem0Key === undefined) {
    rows.push({
      status: "missing",
      name: MEM0_NAME,
      reason: "TODO: MEM0_API_KEY",
    });
  } else {
    if (doIngest) {
      await ingestMem0(corpus.memories, {
        apiKey: mem0Key,
        fetchImpl: options.fetchImpl,
      });
    }
    const outcomes = await vendorOutcomes({
      corpus,
      retrieve: (query) =>
        retrieveMem0Titles(query, corpus.memories, {
          apiKey: mem0Key,
          fetchImpl: options.fetchImpl,
          topK: EVAL_K,
          ...(threshold === undefined ? {} : { threshold }),
        }),
    });
    rows.push({
      status: "ok",
      name: MEM0_NAME,
      metrics: aggregate(outcomes),
      notes: `POST /v3/memories · infer:false · k=${String(EVAL_K)} · threshold ${
        threshold === undefined ? "product default 0.1" : "0 (IR-fair)"
      }`,
    });
  }

  if (smKey === undefined) {
    rows.push({
      status: "missing",
      name: SUPERMEMORY_NAME,
      reason: "TODO: SUPERMEMORY_API_KEY",
    });
  } else {
    if (doIngest) {
      await ingestSuperMemory(corpus.memories, {
        apiKey: smKey,
        fetchImpl: options.fetchImpl,
      });
    }
    const outcomes = await vendorOutcomes({
      corpus,
      retrieve: (query) =>
        retrieveSuperMemoryTitles(query, corpus.memories, {
          apiKey: smKey,
          fetchImpl: options.fetchImpl,
          limit: EVAL_K,
          ...(threshold === undefined ? {} : { threshold }),
        }),
    });
    rows.push({
      status: "ok",
      name: SUPERMEMORY_NAME,
      metrics: aggregate(outcomes),
      notes: `POST /v4/search hybrid · k=${String(EVAL_K)} · threshold ${
        threshold === undefined ? "product default 0.5" : "0 (IR-fair)"
      }`,
    });
  }

  const queryLimit = readPositiveIntEnv("COMPETITIVE_QUERY_LIMIT", env);
  const memoryLimit = readPositiveIntEnv("COMPETITIVE_MEMORY_LIMIT", env);
  const subsetBits: string[] = [];
  if (queryLimit !== undefined) {
    subsetBits.push(`COMPETITIVE_QUERY_LIMIT=${String(queryLimit)}`);
  }
  if (memoryLimit !== undefined) {
    subsetBits.push(`COMPETITIVE_MEMORY_LIMIT=${String(memoryLimit)}`);
  }
  const subsetNote =
    subsetBits.length === 0
      ? "Full labelled set (identical queries for every system)."
      : `Shared subset (${subsetBits.join(", ")}). Same queries for every system.`;

  const report = competitiveLiveReport({
    generated: new Date().toISOString().slice(0, 10),
    memoryCount: corpus.memories.length,
    answerable: answerable.length,
    abstention: abstention.length,
    queryCount: corpus.queries.length,
    embeddingNote: `vmem ${embeddingMode()} (AI Gateway openai/text-embedding-3-small when AI_GATEWAY_API_KEY is set; else synthetic). Mem0/SuperMemory use their hosted embedders.`,
    subsetNote,
    rows,
  });
  return { report, rows };
}

export function assertCompetitiveReady(
  env: Record<string, string | undefined> = process.env,
): void {
  if (missingVendorKeyNames(env).length > 0) {
    throw new Error(EVAL_COMPETITIVE_KEYS_REQUIRED);
  }
}
