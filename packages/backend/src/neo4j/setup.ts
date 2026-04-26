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
    // Composite uniqueness so "React" (technology) for user A doesn't collide
    // with "React" (technology) for user B, and "Apple" (organization) coexists
    // with "Apple" (place) for the same user.
    await session.run(
      `CREATE CONSTRAINT entity_user_name_type IF NOT EXISTS
       FOR (e:Entity) REQUIRE (e.userId, e.normalizedName, e.type) IS UNIQUE`,
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
    console.log("neo4j indexes and constraints ready");
  } finally {
    await session.close();
  }
}
