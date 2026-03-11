import { Driver } from "neo4j-driver";

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
      `CREATE FULLTEXT INDEX memory_content IF NOT EXISTS
       FOR (m:Memory) ON EACH [m.title, m.content]`,
    );
    console.log("neo4j indexes and constraints ready");
  } finally {
    await session.close();
  }
}
