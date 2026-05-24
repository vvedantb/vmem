import { fetchRepositoryFromGithub } from "../github/fetchRepository";
import { getDriver } from "../neo4j/driver";
import { syncCodebase, type SyncStage } from "../neo4j/codebaseService";
import type { ParseStats } from "../neo4j/codebase/types";

export interface RunCodebaseSyncArgs {
  clerkId: string;
  codebaseId: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  githubToken: string;
  onStage: (stage: SyncStage) => Promise<void>;
}

/** Fetch from GitHub, parse, and write to Neo4j — single Node action body. */
export async function runCodebaseSync(
  args: RunCodebaseSyncArgs,
): Promise<ParseStats> {
  const files = await fetchRepositoryFromGithub(
    args.repoOwner,
    args.repoName,
    args.branch,
    args.githubToken,
  );

  return syncCodebase({
    driver: getDriver(),
    userId: args.clerkId,
    codebaseId: args.codebaseId,
    files,
    onStage: args.onStage,
  });
}
