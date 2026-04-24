import { getDriver, closeDriver } from "./driver";

// Same user IDs that were seeded
const SEEDED_USER_IDS = [
  "user_39IXNJeQM9vlRyQ9IdCvKbsqsti",
  "user_3BmJ4t48rN2ZkglhnxOTUJSMpLC",
  "user_35juxUiA6A9h2JbW7TEDk39j3yo",
];

async function unseed() {
  console.log("connecting to Neo4j...");
  const driver = getDriver();
  const session = driver.session();

  try {
    let totalDeleted = 0;

    for (const userId of SEEDED_USER_IDS) {
      console.log(`\ndeleting data for user: ${userId}`);

      // Delete MemoryEvents linked to this user's memories
      const eventResult = await session.run(
        `MATCH (e:MemoryEvent)-[:EVENT_FOR]->(m:Memory {userId: $userId})
         DETACH DELETE e
         RETURN count(e) AS deleted`,
        { userId },
      );
      const eventsDeleted =
        eventResult.records[0]?.get("deleted")?.toNumber() ?? 0;
      console.log(`  deleted ${eventsDeleted} events`);

      // Delete ProposedUpdates linked to this user's memories
      const proposalResult = await session.run(
        `MATCH (p:ProposedUpdate)-[:UPDATE_FOR]->(m:Memory {userId: $userId})
         DETACH DELETE p
         RETURN count(p) AS deleted`,
        { userId },
      );
      const proposalsDeleted =
        proposalResult.records[0]?.get("deleted")?.toNumber() ?? 0;
      console.log(`  deleted ${proposalsDeleted} proposals`);

      // Delete all memories for this user (detach removes TAGGED_WITH, FROM_SOURCE, RELATES_TO edges)
      const memResult = await session.run(
        `MATCH (m:Memory {userId: $userId})
         DETACH DELETE m
         RETURN count(m) AS deleted`,
        { userId },
      );
      const memoriesDeleted =
        memResult.records[0]?.get("deleted")?.toNumber() ?? 0;
      console.log(`  deleted ${memoriesDeleted} memories`);

      totalDeleted += memoriesDeleted;
    }

    // Clean up orphaned Tags (tags with no memories pointing to them)
    console.log("\ncleaning up orphaned tags...");
    const tagResult = await session.run(
      `MATCH (t:Tag)
       WHERE NOT EXISTS { MATCH (:Memory)-[:TAGGED_WITH]->(t) }
       DELETE t
       RETURN count(t) AS deleted`,
    );
    const tagsDeleted = tagResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(`  deleted ${tagsDeleted} orphaned tags`);

    // Clean up orphaned Sources (sources with no memories pointing to them)
    console.log("cleaning up orphaned sources...");
    const sourceResult = await session.run(
      `MATCH (s:Source)
       WHERE NOT EXISTS { MATCH (:Memory)-[:FROM_SOURCE]->(s) }
       DELETE s
       RETURN count(s) AS deleted`,
    );
    const sourcesDeleted =
      sourceResult.records[0]?.get("deleted")?.toNumber() ?? 0;
    console.log(`  deleted ${sourcesDeleted} orphaned sources`);

    console.log("\nunseed complete!");
    console.log(`  total memories deleted: ${totalDeleted}`);
    console.log(`  orphaned tags cleaned: ${tagsDeleted}`);
    console.log(`  orphaned sources cleaned: ${sourcesDeleted}`);
  } finally {
    await session.close();
    await closeDriver();
  }
}

unseed().catch((err) => {
  console.error("unseed failed:", err);
  process.exit(1);
});
