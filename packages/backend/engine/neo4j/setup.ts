import type { Driver } from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "./record";
import { withSession } from "./session";

const SETUP_SENTINEL_INDEX = "code_symbol_search";

export async function isNeo4jSetupComplete(driver: Driver): Promise<boolean> {
  const result = await driver.executeQuery(
    `
    SHOW INDEXES
    YIELD name
    WHERE name = $name
    RETURN count(*) AS c
    `,
    { name: SETUP_SENTINEL_INDEX },
  );
  const first = result.records[0];
  const count = first ? parseNeo4jInt(neo4jGet(first, "c")) : 0;
  return count > 0;
}

export async function ensureNeo4jSetupIfNeeded(
  driver: Driver,
): Promise<boolean> {
  if (await isNeo4jSetupComplete(driver)) return false;
  await setupDatabase(driver);
  return true;
}

const SETUP_STATEMENTS: string[] = [
  "CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE",
  "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
  "CREATE CONSTRAINT source_name IF NOT EXISTS FOR (s:Source) REQUIRE s.name IS UNIQUE",
  "CREATE CONSTRAINT proposed_update_id IF NOT EXISTS FOR (p:ProposedUpdate) REQUIRE p.id IS UNIQUE",
  "CREATE INDEX memory_user_id IF NOT EXISTS FOR (m:Memory) ON (m.userId)",
  "CREATE INDEX memory_type IF NOT EXISTS FOR (m:Memory) ON (m.type)",
  "CREATE INDEX memory_status IF NOT EXISTS FOR (m:Memory) ON (m.status)",
  "CREATE INDEX memory_user_created IF NOT EXISTS FOR (m:Memory) ON (m.userId, m.createdAt)",
  `CREATE FULLTEXT INDEX memory_content IF NOT EXISTS
   FOR (m:Memory) ON EACH [m.title, m.content]`,
  // 1536 dims = openai/text-embedding-3-small
  `CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
   FOR (m:Memory) ON (m.embedding)
   OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
  `CREATE INDEX memory_source_id IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.sourceType, m.sourceId)`,
  `CREATE INDEX memory_user_profile IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.profileId)`,
  `CREATE INDEX memory_user_status IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.status)`,
  `CREATE INDEX memory_user_status_created IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.status, m.createdAt)`,
  // entity identity is (userId, normalizedName) — type is not part of the key
  `CREATE CONSTRAINT entity_user_name IF NOT EXISTS
   FOR (e:Entity) REQUIRE (e.userId, e.normalizedName) IS UNIQUE`,
  `CREATE INDEX entity_user_id IF NOT EXISTS FOR (e:Entity) ON (e.userId)`,
  `CREATE INDEX memory_user_content_hash IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.contentHash)`,
  "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE",
  `CREATE INDEX chunk_user_memory IF NOT EXISTS
   FOR (c:Chunk) ON (c.userId, c.memoryId)`,
  `CREATE FULLTEXT INDEX chunk_content IF NOT EXISTS
   FOR (c:Chunk) ON EACH [c.content]`,
  `CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS
   FOR (c:Chunk) ON (c.embedding)
   OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
  `CREATE CONSTRAINT codefile_id IF NOT EXISTS FOR (n:CodeFile) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT class_id IF NOT EXISTS FOR (n:Class) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT interface_id IF NOT EXISTS FOR (n:Interface) REQUIRE n.id IS UNIQUE`,
  `CREATE CONSTRAINT process_id IF NOT EXISTS FOR (n:Process) REQUIRE n.id IS UNIQUE`,
  `CREATE INDEX codefile_scope IF NOT EXISTS FOR (n:CodeFile) ON (n.userId, n.codebaseId)`,
  `CREATE INDEX function_scope IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId)`,
  `CREATE INDEX class_scope IF NOT EXISTS FOR (n:Class) ON (n.userId, n.codebaseId)`,
  `CREATE INDEX iface_scope IF NOT EXISTS FOR (n:Interface) ON (n.userId, n.codebaseId)`,
  `CREATE INDEX proc_scope IF NOT EXISTS FOR (n:Process) ON (n.userId, n.codebaseId)`,
  `CREATE INDEX function_qname IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.qualifiedName)`,
  `CREATE INDEX function_name IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.name)`,
  `CREATE INDEX class_name IF NOT EXISTS FOR (n:Class) ON (n.userId, n.codebaseId, n.name)`,
  `CREATE FULLTEXT INDEX code_symbol_search IF NOT EXISTS
   FOR (n:Function|Class|Interface) ON EACH [n.name, n.qualifiedName]`,
];

export async function setupDatabase(driver: Driver): Promise<void> {
  await withSession(driver, async (session) => {
    for (const statement of SETUP_STATEMENTS) {
      await session.run(statement);
    }
    console.log("neo4j indexes and constraints ready");
  });
}
