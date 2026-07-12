import { type Driver } from "neo4j-driver";
import { neo4jGet, parseNeo4jInt } from "./record";

/** Fulltext index created by setup — cheap sentinel for "has setup run?". */
const SETUP_SENTINEL_INDEX = "code_symbol_search";

/** True when core Neo4j indexes/constraints from `setupDatabase` exist. */
export async function isNeo4jSetupComplete(driver: Driver): Promise<boolean> {
  const session = driver.session();
  try {
    const result = await session.run(
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
  } finally {
    await session.close();
  }
}

/**
 * Idempotent setup for fresh or partially-provisioned Neo4j instances.
 * Returns whether `setupDatabase` ran (false when indexes already existed).
 */
export async function ensureNeo4jSetupIfNeeded(
  driver: Driver,
): Promise<boolean> {
  if (await isNeo4jSetupComplete(driver)) return false;
  await setupDatabase(driver);
  return true;
}

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
    // Vector index for semantic (embedding-based) retrieval. Dimensions must
    // match the embedding model used by `embeddingService.ts`
    // (openai/text-embedding-3-small → 1536). Cosine similarity is the
    // standard for normalized embedding vectors from OpenAI-family models.
    // Neo4j 5.11+ required (we run 5.28.x per neo4j-driver version).
    await session.run(
      `CREATE VECTOR INDEX memory_embedding IF NOT EXISTS
       FOR (m:Memory) ON (m.embedding)
       OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
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
    // Three-way composite for the hot "list recent active memories" path used
    // by both the list page and the graph page. Matches the pattern:
    //   WHERE m.userId = $u AND m.status IN ['active','pinned']
    //   ORDER BY m.createdAt DESC
    // One index seek + already-sorted output, so the planner can skip a Sort
    // when paginating 12k+ memories.
    await session.run(
      `CREATE INDEX memory_user_status_created IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.status, m.createdAt)`,
    );
    // Entity nodes — per-user named entities extracted during LLM enrichment.
    // Identity is (userId, normalizedName) ONLY — type is a plain property.
    // Type used to be part of the key, but LLM extraction oscillates on
    // classification ("agenteva1[bot]" person vs technology, a repo as
    // organization vs technology), which minted duplicate nodes for the same
    // real-world entity (84 dupe groups on one account). First-seen type wins.
    await session.run(
      `CREATE CONSTRAINT entity_user_name IF NOT EXISTS
       FOR (e:Entity) REQUIRE (e.userId, e.normalizedName) IS UNIQUE`,
    );
    await session.run(
      `CREATE INDEX entity_user_id IF NOT EXISTS FOR (e:Entity) ON (e.userId)`,
    );
    // Composite index for content-hash deduplication — fast lookup by
    // (userId, contentHash) so we can detect exact-duplicate memories in O(1).
    await session.run(
      `CREATE INDEX memory_user_content_hash IF NOT EXISTS
       FOR (m:Memory) ON (m.userId, m.contentHash)`,
    );
    // ── Chunk-level retrieval infrastructure ────────────────────────────
    // Long memories (>2 KB content) are split into ~500-token sliding-window
    // chunks; each chunk is its own node with its own embedding so retrieval
    // can pinpoint paragraph-level matches inside a long PDF/article. Memory
    // node embeddings are still kept (used for whole-memory dedup + recall).
    await session.run(
      "CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE",
    );
    await session.run(
      `CREATE INDEX chunk_user_memory IF NOT EXISTS
       FOR (c:Chunk) ON (c.userId, c.memoryId)`,
    );
    await session.run(
      `CREATE FULLTEXT INDEX chunk_content IF NOT EXISTS
       FOR (c:Chunk) ON EACH [c.content]`,
    );
    await session.run(
      `CREATE VECTOR INDEX chunk_embedding IF NOT EXISTS
       FOR (c:Chunk) ON (c.embedding)
       OPTIONS {indexConfig: {\`vector.dimensions\`: 1536, \`vector.similarity_function\`: 'cosine'}}`,
    );
    // ── Codebase parser (Phase 1) ─────────────────────────────────────
    // Stable IDs across CodeFile/Function/Class/Interface/Process so MERGE
    // re-syncs idempotently. Scoping indexes on (userId, codebaseId) keep
    // queries fast even with many users sharing the cluster. Symbol search
    // uses a single fulltext index across all named symbols.
    await session.run(
      `CREATE CONSTRAINT codefile_id IF NOT EXISTS FOR (n:CodeFile) REQUIRE n.id IS UNIQUE`,
    );
    await session.run(
      `CREATE CONSTRAINT function_id IF NOT EXISTS FOR (n:Function) REQUIRE n.id IS UNIQUE`,
    );
    await session.run(
      `CREATE CONSTRAINT class_id IF NOT EXISTS FOR (n:Class) REQUIRE n.id IS UNIQUE`,
    );
    await session.run(
      `CREATE CONSTRAINT interface_id IF NOT EXISTS FOR (n:Interface) REQUIRE n.id IS UNIQUE`,
    );
    await session.run(
      `CREATE CONSTRAINT process_id IF NOT EXISTS FOR (n:Process) REQUIRE n.id IS UNIQUE`,
    );
    await session.run(
      `CREATE INDEX codefile_scope IF NOT EXISTS FOR (n:CodeFile) ON (n.userId, n.codebaseId)`,
    );
    await session.run(
      `CREATE INDEX function_scope IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId)`,
    );
    await session.run(
      `CREATE INDEX class_scope IF NOT EXISTS FOR (n:Class) ON (n.userId, n.codebaseId)`,
    );
    await session.run(
      `CREATE INDEX iface_scope IF NOT EXISTS FOR (n:Interface) ON (n.userId, n.codebaseId)`,
    );
    await session.run(
      `CREATE INDEX proc_scope IF NOT EXISTS FOR (n:Process) ON (n.userId, n.codebaseId)`,
    );
    await session.run(
      `CREATE INDEX function_qname IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.qualifiedName)`,
    );
    await session.run(
      `CREATE INDEX function_name IF NOT EXISTS FOR (n:Function) ON (n.userId, n.codebaseId, n.name)`,
    );
    await session.run(
      `CREATE INDEX class_name IF NOT EXISTS FOR (n:Class) ON (n.userId, n.codebaseId, n.name)`,
    );
    // Combined fulltext index spanning Function/Class/Interface so the
    // search box can hit one index regardless of symbol kind.
    await session.run(
      `CREATE FULLTEXT INDEX code_symbol_search IF NOT EXISTS
       FOR (n:Function|Class|Interface) ON EACH [n.name, n.qualifiedName]`,
    );
    console.log("neo4j indexes and constraints ready");
  } finally {
    await session.close();
  }
}
