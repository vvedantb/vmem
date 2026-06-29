/**
 * Seed the discriminating benchmark corpus (eval/corpus.ts) into Neo4j for
 * `pnpm eval:bench`. Unlike `db:seed:eval`, it does NOT apply the corpus
 * profile — the generator already sets dates/confidence/status deliberately
 * (temporal queries depend on those). `runSeed` wipes all data, so this
 * replaces whatever corpus is loaded.
 *
 * Run: `pnpm db:seed:bench`
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
}).catch((err) => {
  console.error("bench seed failed:", err);
  process.exit(1);
});
