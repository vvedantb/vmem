import type { Driver } from "neo4j-driver";
import { deleteAllMemoriesForUser } from "../../engine/neo4j/memory/crud";
import { setEmbeddings } from "../../engine/neo4j/memory/migration";
import { setupDatabase } from "../../engine/neo4j/setup";
import { embeddingMode, generateCliEmbeddings } from "./cliEmbeddings";
import { BENCH_USER_ID, type BenchmarkCorpus } from "./corpus";

const EMBEDDING_WRITE_BATCH_SIZE = 20;

export async function seedBenchmarkUser(
  driver: Driver,
  corpus: BenchmarkCorpus,
): Promise<void> {
  console.log("ensuring indexes and constraints...");
  await setupDatabase(driver);

  const deleted = await deleteAllMemoriesForUser(driver, BENCH_USER_ID);
  console.log(
    `cleared ${String(deleted)} existing memories for ${BENCH_USER_ID}`,
  );

  console.log(`inserting ${String(corpus.memories.length)} memories...`);
  await driver.executeQuery(
    `UNWIND $memories AS mem
     CREATE (m:Memory {
       id: mem.id, userId: mem.userId, title: mem.title,
       content: mem.content, type: mem.type, source: mem.source,
       confidence: mem.confidence, status: mem.status,
       createdAt: mem.createdAt, updatedAt: mem.updatedAt,
       expiresAt: mem.expiresAt
     })
     WITH m, mem
     MERGE (s:Source {name: mem.source})
     CREATE (m)-[:FROM_SOURCE]->(s)
     WITH m, mem
     FOREACH (tagName IN mem.tags |
       MERGE (t:Tag {name: tagName})
       MERGE (m)-[:TAGGED_WITH]->(t)
     )`,
    { memories: corpus.memories },
  );

  console.log(
    `creating ${String(corpus.relationships.length)} relationships...`,
  );
  await driver.executeQuery(
    `UNWIND $rels AS rel
     MATCH (a:Memory {id: rel.sourceId})
     MATCH (b:Memory {id: rel.targetId})
     CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
    { rels: corpus.relationships },
  );

  console.log(`embedding ${String(corpus.memories.length)} memories...`);
  const vectors = await generateCliEmbeddings(
    corpus.memories.map((memory) => `${memory.title}\n\n${memory.content}`),
  );
  const writes = corpus.memories.map((memory, index) => {
    const embedding = vectors[index];
    if (embedding === undefined) {
      throw new Error(`missing embedding for memory at index ${String(index)}`);
    }
    return { id: memory.id, embedding };
  });
  for (
    let offset = 0;
    offset < writes.length;
    offset += EMBEDDING_WRITE_BATCH_SIZE
  ) {
    await setEmbeddings(
      driver,
      writes.slice(offset, offset + EMBEDDING_WRITE_BATCH_SIZE),
    );
  }

  console.log(
    `done: ${String(corpus.memories.length)} memories, ${String(corpus.relationships.length)} relationships · embeddings: ${embeddingMode()}`,
  );
}
