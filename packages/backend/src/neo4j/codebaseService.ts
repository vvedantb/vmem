/**
 * Thin orchestrator over the Phase 1 codebase parser pipeline. Composed
 * by the `"use node"` Convex action — the real work lives in:
 *
 *   src/neo4j/codebase/parse.ts          ts-morph AST walk
 *   src/neo4j/codebase/resolveCalls.ts   type-checker call resolution
 *   src/neo4j/codebase/entryPoints.ts    Convex/TanStack/heuristic detection
 *   src/neo4j/codebase/processes.ts      BFS process construction
 *   src/neo4j/codebase/write.ts          bulk Neo4j write
 *   src/neo4j/codebase/read.ts           graph/symbol/search read helpers
 *   src/neo4j/codebase/impact.ts         blast-radius traversal
 */

import type { Driver } from "neo4j-driver";
import { parseRepository, type SourceFileBlob } from "./codebase/parse";
import { resolveCalls } from "./codebase/resolveCalls";
import { detectEntryPoints } from "./codebase/entryPoints";
import { detectProcesses } from "./codebase/processes";
import { writeParseResult } from "./codebase/write";
import {
  getGraphOverview,
  getOverviewStats,
  getSymbolContext,
  searchSymbols,
  type OverviewNode,
  type SearchSymbolsResult,
} from "./codebase/read";
import {
  getDownstreamImpact,
  getUpstreamImpact,
  type ImpactDirection,
  type ImpactNode,
} from "./codebase/impact";
import { type ParseStats, PARSER_VERSION } from "./codebase/types";

export const CODEBASE_PARSER_VERSION = PARSER_VERSION;

/** Hard cap — enforced upstream too, but defended here. */
export const MAX_FILES_PER_SYNC = 3000;

export interface SyncCodebaseInput {
  driver: Driver;
  userId: string;
  codebaseId: string;
  files: SourceFileBlob[];
  /** Optional progress callback — invoked at each major stage. */
  onStage?: (stage: SyncStage) => Promise<void> | void;
}

export type SyncStage =
  | "fetching"
  | "parsing"
  | "processes"
  | "writing"
  | "done";

export async function syncCodebase(
  input: SyncCodebaseInput,
): Promise<ParseStats> {
  if (input.files.length > MAX_FILES_PER_SYNC) {
    throw new Error(
      `Repository too large for Phase 1 sync (${input.files.length} files; limit ${MAX_FILES_PER_SYNC}). Chunked sync coming in Phase 3.`,
    );
  }

  await input.onStage?.("parsing");
  const { project, result } = parseRepository({
    codebaseId: input.codebaseId,
    files: input.files,
  });
  const { calls } = resolveCalls(project, result, input.codebaseId);

  await input.onStage?.("processes");
  const entryPoints = detectEntryPoints(project, result.symbols, calls);
  const processes = detectProcesses(input.codebaseId, entryPoints, calls);

  await input.onStage?.("writing");
  const stats = await writeParseResult({
    driver: input.driver,
    userId: input.userId,
    codebaseId: input.codebaseId,
    symbols: result.symbols,
    structuralRelations: result.structuralRelations,
    calls,
    processes,
  });

  await input.onStage?.("done");
  return stats;
}

export async function deleteCodebase(
  driver: Driver,
  userId: string,
  codebaseId: string,
): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
      DETACH DELETE n
      `,
      { userId, codebaseId },
    );
  } finally {
    await session.close();
  }
}

// Re-exports — the thin orchestrator's public surface mirrors the
// individual modules so callers in `convex/neo4jActions/codebases.ts`
// can import everything from one place.
export {
  getGraphOverview,
  getOverviewStats,
  getSymbolContext,
  searchSymbols,
  getUpstreamImpact,
  getDownstreamImpact,
};
export type { OverviewNode, SearchSymbolsResult, ImpactNode, ImpactDirection };
