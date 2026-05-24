import { describe, expect, it } from "vitest";
import { embeddingMode, generateCliEmbedding } from "./cliEmbeddings";
import { closeDriver, getDriver } from "../../driver";
import { retrieveMemories } from "../retrieve";
import { recallAtFive, reciprocalRank } from "./metrics";
import { RETRIEVAL_EVAL_QUERIES, RETRIEVAL_EVAL_USER_ID } from "./queries";

const runLiveEval = process.env.RUN_RETRIEVAL_EVAL === "1";

describe.skipIf(!runLiveEval)("retrieval eval (live Neo4j)", () => {
  it("finds expected memories for every eval query", async () => {
    const driver = getDriver();
    try {
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
        const mrr = reciprocalRank(titles, item.expectedTitles);

        expect(
          recall,
          `query "${item.query}" recall@5 — got: ${titles.join(" | ")}`,
        ).toBeGreaterThan(0);
        expect(
          mrr,
          `query "${item.query}" mrr — got: ${titles.join(" | ")}`,
        ).toBeGreaterThan(0);
      }
    } finally {
      await closeDriver();
    }
  }, 120_000);

  it("reports embedding mode for CI logs", () => {
    expect(embeddingMode().length).toBeGreaterThan(0);
  });
});
