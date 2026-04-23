import type { Driver } from "neo4j-driver";

export async function setupDatabase(driver: Driver): Promise<void> {
  const session = driver.session();
  try {
    await session.run(
      "CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT source_name IF NOT EXISTS FOR (s:Source) REQUIRE s.name IS UNIQUE",
    );
    await session.run(
      "CREATE CONSTRAINT proposed_update_id IF NOT EXISTS FOR (p:ProposedUpdate) REQUIRE p.id IS UNIQUE",
    );
    await session.run(
      "CREATE INDEX memory_user_id IF NOT EXISTS FOR (m:Memory) ON (m.userId)",
    );
    await session.run(
      "CREATE INDEX memory_type IF NOT EXISTS FOR (m:Memory) ON (m.type)",
    );
    await session.run(
      "CREATE INDEX memory_status IF NOT EXISTS FOR (m:Memory) ON (m.status)",
    );
    await session.run(
      "CREATE INDEX memory_user_created IF NOT EXISTS FOR (m:Memory) ON (m.userId, m.createdAt)",
    );
    await session.run(
      `CREATE FULLTEXT INDEX memory_content IF NOT EXISTS
       FOR (m:Memory) ON EACH [m.title, m.content]`,
    );
    // Index for connector sync upserts — lookup by source
    await session.run(
      `CREATE INDEX memory_source_id IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.sourceType, m.sourceId)`,
    );
    // Composite index for profile-scoped queries
    await session.run(
      `CREATE INDEX memory_user_profile IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.profileId)`,
    );
    // Composite index for (userId, status) — used heavily in graph/list queries
    // where we filter by user then by status IN ['active', 'pinned']. Lets the
    // planner do a single index seek instead of seeking on userId and then
    // applying a post-filter row-by-row.
    await session.run(
      `CREATE INDEX memory_user_status IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.status)`,
    );
    console.log("neo4j indexes and constraints ready");
  } finally {
    await session.close();
  }
}
