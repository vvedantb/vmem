"use node";

import type { Driver } from "neo4j-driver";
import { getDriver } from "../../../engine/neo4j/driver";

type Neo4jUserArgs = { clerkId: string };

// thin internalaction pass through
export async function runWithNeo4jDriver<Args extends Neo4jUserArgs, Result>(
  args: Args,
  fn: (
    params: Omit<Args, "clerkId"> & { driver: Driver; userId: string },
  ) => Promise<Result>,
): Promise<Result> {
  const { clerkId, ...rest } = args;
  return fn({
    ...rest,
    driver: getDriver(),
    userId: clerkId,
  });
}
