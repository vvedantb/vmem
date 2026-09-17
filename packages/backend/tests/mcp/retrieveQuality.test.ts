import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    expect(runtime).toContain("applyJevRetrieveGate");
    expect(runtime).toContain("wantsJevJudge");
    const pool = read("engine/memory/retrieve.ts");
    expect(pool).toContain("return rankMemories(pool, query, options)");
    const evalRetrieve = read("eval/retrieve.ts");
    expect(evalRetrieve).toContain("retrieveMemoriesFromPool");
    expect(evalRetrieve).toContain("applyJevRetrieveGate");
    expect(evalRetrieve).toContain("evalWantsJev");
    expect(evalRetrieve).toContain("jevRankPoolLimit");
    expect(runtime).toContain("getMemoriesByMemoryIdsInternal");
    expect(runtime).toContain("RETRIEVE_RANK_POOL_CAP");
    expect(runtime).toContain("VECTOR_CANDIDATE_LIMIT");
    const caps = read("engine/memory/retrieveCaps.ts");
    expect(caps).toContain("export const FTS_TAKE = 256");
    expect(caps).toContain("export const VECTOR_CANDIDATE_LIMIT");
    expect(caps).toContain("export const LEGACY_FTS_TAKE = 32");
  });
});
