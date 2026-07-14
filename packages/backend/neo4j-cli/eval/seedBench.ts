// seeds the benchmark corpus for user_vmem_bench_eval before eval:bench

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
