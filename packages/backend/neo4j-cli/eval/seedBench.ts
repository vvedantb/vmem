/**
 * Seed the discriminating benchmark corpus (eval/corpus.ts) into Neo4j.
 * Invoked by `pnpm eval:bench` before the ablation runner. `runSeed` wipes
 * all data, so this replaces whatever corpus is loaded.
 */

import { generateBenchmarkCorpus, BENCH_USER_ID } from "./corpus";
import { runSeed } from "../seed/engine";

const corpus = generateBenchmarkCorpus();

runSeed({
  userIds: [BENCH_USER_ID],
  templateMemories: corpus.memories,
  templateRelationships: corpus.relationships,
  embedAfterInsert: true,
  logLabel: `bench corpus: ${String(corpus.memories.length)} memories, ${String(corpus.relationships.length)} relationships, ${String(corpus.queries.length)} queries`,
}).catch((err: unknown) => {
  console.error("bench seed failed:", err);
  process.exit(1);
});
