/**
 * Purge benchmark data from Neo4j.
 *
 * By default removes every synthetic bench user (userId prefixed
 * `bench_locomo_`) — memories, chunks, entities, events — then sweeps
 * orphaned tags/sources (mirrors `unseed.ts`). Strictly scoped to the bench
 * prefix so it can never touch real user data.
 *
 * With `--user <clerkId>` it instead removes only bench-tagged memories
 * (source = "locomo-bench") under that real user — used after a `--user`
 * visual-inspection ingest.
 *
 * Usage: pnpm bench:cleanup            # all synthetic bench users
 *        pnpm bench:cleanup --user user_abc123
 */

import { closeDriver, getDriver } from "../../engine/neo4j/driver";

const SYNTHETIC_PREFIX = "bench_locomo_";
const BENCH_SOURCE = "locomo-bench";

function userArg(): string | undefined {
  const idx = process.argv.indexOf("--user");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function cleanupSynthetic(): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    console.log(
      `deleting synthetic bench users (userId starts with "${SYNTHETIC_PREFIX}")…`,
    );

    await session.run(
      `MATCH (c:Chunk) WHERE c.userId STARTS WITH $prefix DETACH DELETE c`,
      { prefix: SYNTHETIC_PREFIX },
    );
    await session.run(
      `MATCH (e:Entity) WHERE e.userId STARTS WITH $prefix DETACH DELETE e`,
      { prefix: SYNTHETIC_PREFIX },
    );
    const memResult = await session.run(
      `MATCH (m:Memory) WHERE m.userId STARTS WITH $prefix
       OPTIONAL MATCH (ev:MemoryEvent)-[:EVENT_FOR]->(m)
       DETACH DELETE ev, m
       RETURN count(DISTINCT m) AS deleted`,
      { prefix: SYNTHETIC_PREFIX },
    );
    const deleted = memResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(`  deleted ${String(deleted)} memories`);

    await sweepOrphans(session);
  } finally {
    await session.close();
    await closeDriver();
  }
}

async function cleanupUser(userId: string): Promise<void> {
  const driver = getDriver();
  const session = driver.session();
  try {
    console.log(`deleting bench-tagged memories for user ${userId}…`);
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId, source: $source})
       OPTIONAL MATCH (c:Chunk {memoryId: m.id})
       OPTIONAL MATCH (ev:MemoryEvent)-[:EVENT_FOR]->(m)
       DETACH DELETE c, ev, m
       RETURN count(DISTINCT m) AS deleted`,
      { userId, source: BENCH_SOURCE },
    );
    const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(`  deleted ${String(deleted)} memories`);
    await sweepOrphans(session);
  } finally {
    await session.close();
    await closeDriver();
  }
}

async function sweepOrphans(
  session: ReturnType<ReturnType<typeof getDriver>["session"]>,
): Promise<void> {
  const tagResult = await session.run(
    `MATCH (t:Tag) WHERE NOT EXISTS { MATCH (:Memory)-[:TAGGED_WITH]->(t) }
     DELETE t RETURN count(t) AS deleted`,
  );
  console.log(
    `  swept ${String(tagResult.records[0]?.get("deleted")?.toNumber() ?? 0)} orphan tags`,
  );
  const sourceResult = await session.run(
    `MATCH (s:Source) WHERE NOT EXISTS { MATCH (:Memory)-[:FROM_SOURCE]->(s) }
     DELETE s RETURN count(s) AS deleted`,
  );
  console.log(
    `  swept ${String(sourceResult.records[0]?.get("deleted")?.toNumber() ?? 0)} orphan sources`,
  );
}

async function main(): Promise<void> {
  const user = userArg();
  if (user) {
    await cleanupUser(user);
  } else {
    await cleanupSynthetic();
  }
  console.log("cleanup complete");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
