import { closeDriver, getDriver } from "../../driver";
import { retrieveMemories } from "../retrieve";
import { RETRIEVAL_EVAL_QUERIES, RETRIEVAL_EVAL_USER_ID } from "./queries";

const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

function extractJsonArray(source: string, startIndex: number): string | null {
  const start = source.indexOf("[", startIndex);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (depth === 0) return source.slice(start + 1, i);
  }

  return null;
}

function parseEmbedding(body: string): number[] | null {
  const markerIndex = body.indexOf('"embedding"');
  if (markerIndex === -1) return null;
  const rawArray = extractJsonArray(body, markerIndex);
  if (rawArray === null) return null;

  const values = rawArray
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values.length > 0 ? values : null;
}

async function embedQuery(query: string): Promise<number[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(EMBEDDING_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [query] }),
  });
  if (!response.ok) return null;
  return parseEmbedding(await response.text());
}

function reciprocalRank(titles: string[], expectedTitles: string[]): number {
  const expected = new Set(expectedTitles);
  const firstRelevantIndex = titles.findIndex((title) => expected.has(title));
  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}

function recallAtFive(titles: string[], expectedTitles: string[]): number {
  const topFive = new Set(titles.slice(0, 5));
  const hits = expectedTitles.filter((title) => topFive.has(title)).length;
  return hits / expectedTitles.length;
}

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
    console.log("");

    for (const item of RETRIEVAL_EVAL_QUERIES) {
      const queryEmbedding = await embedQuery(item.query);
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
    console.log(`overall recall@5: ${formatNumber(recallTotal / count)}`);
    console.log(`overall mrr: ${formatNumber(reciprocalRankTotal / count)}`);
  } finally {
    await closeDriver();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
