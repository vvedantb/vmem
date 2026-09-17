import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aggregate,
  NEO4J_FULL_HYBRID,
  runAblation,
} from "../../eval/benchmark";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
  return readFileSync(join(backendRoot, rel), "utf8");
}

describe("MCP retrieve uses the labelled Convex hybrid ranker", () => {
  it("memory_retrieve calls retrieveMemoriesForClerk / retrieveMemoriesForTeamProfile", () => {
    const source = read("convex/mcp/toolsMemory.ts");
    expect(source).toContain("retrieveMemoriesForClerk");
    expect(source).toContain("retrieveMemoriesForTeamProfile");
    expect(source).toContain("query: params.query");
  });

  it("those runtimes rank through retrieveMemoriesFromPool / rankMemories", () => {
    const runtime = read("convex/memoryRuntime.ts");
    expect(runtime).toContain("retrieveMemoriesFromPool");
    expect(runtime).toContain("return retrieveMemoriesFromPool");
    const pool = read("engine/memory/retrieve.ts");
    expect(pool).toContain("return rankMemories(pool, query, options)");
    const evalRetrieve = read("eval/retrieve.ts");
    expect(evalRetrieve).toContain(
      "return retrieveMemoriesFromPool(memories, query,",
    );
  });

  it("full hybrid on the labelled corpus meets the Neo4j 2026-07-18 bar", async () => {
    const { runs, report } = await runAblation();
    console.log(`\n${report}\n`);
    const full = aggregate(
      runs.find((run) => run.name === "full hybrid")?.outcomes ?? [],
    );
    expect(full.recall5).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.recall5);
    expect(full.mrr).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.mrr);
    expect(full.ndcg10).toBeGreaterThanOrEqual(NEO4J_FULL_HYBRID.ndcg10);
  }, 60_000);
});
