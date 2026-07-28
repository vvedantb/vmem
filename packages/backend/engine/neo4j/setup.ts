import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { neo4jField, neo4jString, stringSchema } from "./record";
import { withSession } from "./session";

// Fulltext indexes are declared as data rather than Cypher because the live
// property set has to be compared against the declaration. `CREATE ... IF NOT
// EXISTS` silently keeps an existing index whatever it indexes, so a widened
// declaration never reaches a database that already has the old index.
interface FulltextIndexSpec {
  name: string;
  alias: string;
  labels: string;
  properties: string[];
}

const FULLTEXT_INDEXES: FulltextIndexSpec[] = [
  {
    name: "memory_content",
    alias: "m",
    labels: "Memory",
    properties: ["title", "content"],
  },
  {
    name: "chunk_content",
    alias: "c",
    labels: "Chunk",
    properties: ["content"],
  },
  {
    name: "code_symbol_search",
    alias: "n",
    labels: "Function|Class|Interface",
    properties: ["name", "qualifiedName"],
  },
];

function fulltextCreateCypher(spec: FulltextIndexSpec): string {
  const properties = spec.properties
    .map((property) => `${spec.alias}.${property}`)
    .join(", ");
  return `CREATE FULLTEXT INDEX ${spec.name} IF NOT EXISTS
   FOR (${spec.alias}:${spec.labels}) ON EACH [${properties}]`;
}

const propertyListSchema = z.array(z.string());

function sameProperties(live: string[], declared: string[]): boolean {
  if (live.length !== declared.length) return false;
  const liveSet = new Set(live);
  return declared.every((property) => liveSet.has(property));
}

// Neo4j cannot widen a fulltext index in place, so drift means drop + recreate.
// Repopulation is asynchronous: the index answers nothing until it is ONLINE
// again, which is why this logs loudly. Returns the names it rebuilt.
async function repairDriftedFulltextIndexes(driver: Driver): Promise<string[]> {
  const result = await driver.executeQuery(
    `SHOW INDEXES YIELD name, type, properties
     WHERE type = 'FULLTEXT' AND name IN $names
     RETURN name, properties`,
    { names: FULLTEXT_INDEXES.map((spec) => spec.name) },
  );
  const live = new Map<string, string[]>();
  for (const record of result.records) {
    live.set(
      neo4jField(record, "name", stringSchema),
      neo4jField(record, "properties", propertyListSchema),
    );
  }

  const rebuilt: string[] = [];
  for (const spec of FULLTEXT_INDEXES) {
    const actual = live.get(spec.name);
    if (actual === undefined) continue; // absent, so the CREATE statement covers it
    if (sameProperties(actual, spec.properties)) continue;
    console.warn(
      `neo4j fulltext index ${spec.name} indexes [${actual.join(", ")}] but should index [${spec.properties.join(", ")}] — dropping and recreating; it returns no results until repopulation finishes`,
    );
    await withSession(driver, async (session) => {
      // index names cannot be parameterised; these are module constants
      await session.run(`DROP INDEX ${spec.name}`);
      await session.run(fulltextCreateCypher(spec));
    });
    rebuilt.push(spec.name);
  }
  return rebuilt;
}

// Uniqueness constraints are backed by an index of the same name, so one
// SHOW INDEXES covers both halves of SETUP_STATEMENTS.
async function findMissingDdl(driver: Driver): Promise<string[]> {
  const result = await driver.executeQuery(
    `SHOW INDEXES YIELD name WHERE name IN $names RETURN name`,
    { names: DECLARED_DDL_NAMES },
  );
  const present = new Set(
    result.records.map((record) => neo4jString(record, "name")),
  );
  return DECLARED_DDL_NAMES.filter((name) => !present.has(name));
}

export async function ensureNeo4jSetupIfNeeded(
  driver: Driver,
): Promise<boolean> {
  const missing = await findMissingDdl(driver);
  if (missing.length > 0) {
    console.log(`neo4j setup: missing ${missing.join(", ")}`);
    await setupDatabase(driver);
    return true;
  }
  return (await repairDriftedFulltextIndexes(driver)).length > 0;
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
  // 1536 dims = openai/text-embedding-3-small
  `CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
   FOR (m:Memory) ON (m.embedding)
   OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
  `CREATE INDEX memory_source_id IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.sourceType, m.sourceId)`,
  `CREATE INDEX memory_user_profile IF NOT EXISTS
   FOR (m:Memory) ON (m.userId, m.profileId)`,
  // team scope matches on profileId alone, without a leading userId
  `CREATE INDEX memory_profile_id IF NOT EXISTS
   FOR (m:Memory) ON (m.profileId)`,
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
  ...FULLTEXT_INDEXES.map(fulltextCreateCypher),
];

// Every statement names the index or constraint it creates, so the names can be
// derived instead of duplicated — a hand-kept list is exactly what drifts.
const DDL_NAME_PATTERN = /(?:CONSTRAINT|INDEX)\s+(\w+)\s+IF NOT EXISTS/;

function ddlName(statement: string): string {
  const match = DDL_NAME_PATTERN.exec(statement);
  const name = match?.[1];
  if (name === undefined) {
    throw new Error(`neo4j setup statement has no DDL name: ${statement}`);
  }
  return name;
}

export const DECLARED_DDL_NAMES: string[] = SETUP_STATEMENTS.map(ddlName);

export async function setupDatabase(driver: Driver): Promise<void> {
  await withSession(driver, async (session) => {
    for (const statement of SETUP_STATEMENTS) {
      await session.run(statement);
    }
    console.log("neo4j indexes and constraints ready");
  });
  // the CREATE statements above are no-ops for an index that already exists
  // under the wrong property set, so drift repair has to follow them
  await repairDriftedFulltextIndexes(driver);
}
