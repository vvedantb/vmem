import { embeddingMode, generateCliEmbedding } from "./cliEmbeddings";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { retrieveMemories } from "../../engine/neo4j/memory/retrieve";
import { recallAtFive, reciprocalRank } from "./metrics";
import { RETRIEVAL_EVAL_QUERIES, RETRIEVAL_EVAL_USER_ID } from "./queries";

function formatNumber(value: number): string {
  return value.toFixed(4);
}

async function main(): Promise<void> {
  const driver = getDriver();
  let recallTotal = 0;
  let reciprocalRankTotal = 0;

  try {
    console.log("retrieval eval");
    console.log(`user: ${RETRIEVAL_EVAL_USER_ID}`);
    console.log(`queries: ${String(RETRIEVAL_EVAL_QUERIES.length)}`);
    console.log(`embeddings: ${embeddingMode()}`);
    console.log("");

    for (const item of RETRIEVAL_EVAL_QUERIES) {
      const queryEmbedding = await generateCliEmbedding(item.query);
      const candidates = await retrieveMemories(driver, {
        userId: RETRIEVAL_EVAL_USER_ID,
        query: item.query,
        queryEmbedding,
        limit: 5,
      });

      const titles = candidates.map((candidate) => candidate.title);
      const recall = recallAtFive(titles, item.expectedTitles);
      const rr = reciprocalRank(titles, item.expectedTitles);
      recallTotal += recall;
      reciprocalRankTotal += rr;

      console.log(`query: ${item.query}`);
      console.log(`expected: ${item.expectedTitles.join(" | ")}`);
      console.log(`recall@5: ${formatNumber(recall)} mrr: ${formatNumber(rr)}`);
      candidates.forEach((candidate, index) => {
        const b = candidate.trace.scoreBreakdown;
        console.log(
          `${String(index + 1)}. ${candidate.title} score=${formatNumber(candidate.trace.score)} rrf=${formatNumber(b.rrf)} fulltext=${formatNumber(b.fulltext)} vector=${formatNumber(b.vector)} chunk=${formatNumber(b.chunk)} entity=${formatNumber(b.entity)} recency=${formatNumber(b.recency)} confidence=${formatNumber(b.confidence)}`,
        );
      });
      console.log("");
    }

    const count = RETRIEVAL_EVAL_QUERIES.length;
    const overallRecall = recallTotal / count;
    const overallMrr = reciprocalRankTotal / count;

    console.log(`overall recall@5: ${formatNumber(overallRecall)}`);
    console.log(`overall mrr: ${formatNumber(overallMrr)}`);

    if (overallRecall < 1 || overallMrr < 1) {
      console.error(
        "\neval failed: expected recall@5=1.0000 and mrr=1.0000. Run `pnpm db:seed:eval` first.",
      );
      process.exit(1);
    }
  } finally {
    await closeDriver();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
