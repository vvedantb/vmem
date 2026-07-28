import type { Driver } from "neo4j-driver";
import { parseRepository, type SourceFileBlob } from "./codebase/parse";
import { resolveCalls } from "./codebase/resolveCalls";
import { detectEntryPoints } from "./codebase/entryPoints";
import { detectProcesses } from "./codebase/processes";
import { writeParseResult } from "./codebase/write";
import type { ParseStats } from "./codebase/types";

export const MAX_FILES_PER_SYNC = 3000;

export interface SyncCodebaseInput {
  driver: Driver;
  userId: string;
  codebaseId: string;
  files: SourceFileBlob[];
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
  const calls = resolveCalls(project, result);

  await input.onStage?.("processes");
  const entryPoints = detectEntryPoints(result.symbols, calls);
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
  await driver.executeQuery(
    `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
      DETACH DELETE n
      `,
    { userId, codebaseId },
  );
}
