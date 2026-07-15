import type { Driver } from "neo4j-driver";
import { deleteAllMemoriesForUser } from "../../engine/neo4j/memory/crud";
import { setEmbeddings } from "../../engine/neo4j/memory/migration";
import { setupDatabase } from "../../engine/neo4j/setup";
import { embeddingMode, generateCliEmbeddings } from "./cliEmbeddings";
import {
  BENCH_USER_ID,
  type SeedMemory,
  type SeedRelationship,
} from "./corpus";

const EMBED_BATCH = 20;

export interface BenchmarkCorpusSeed {
  memories: SeedMemory[];
  relationships: SeedRelationship[];
}

export async function seedBenchmarkUser(
  driver: Driver,
  corpus: BenchmarkCorpusSeed,
): Promise<void> {
  const session = driver.session();

  try {
    console.log("ensuring indexes and constraints...");
    await setupDatabase(driver);

    const deleted = await deleteAllMemoriesForUser(driver, BENCH_USER_ID);
    console.log(
      `cleared ${String(deleted)} existing memories for ${BENCH_USER_ID}`,
    );

    console.log(`inserting ${String(corpus.memories.length)} memories...`);
    await session.run(
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
    await session.run(
      `UNWIND $rels AS rel
       MATCH (a:Memory {id: rel.sourceId})
       MATCH (b:Memory {id: rel.targetId})
       CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
      { rels: corpus.relationships },
    );

    console.log(`embedding ${String(corpus.memories.length)} memories...`);
    for (
      let offset = 0;
      offset < corpus.memories.length;
      offset += EMBED_BATCH
    ) {
      const batch = corpus.memories.slice(offset, offset + EMBED_BATCH);
      const texts = batch.map(
        (memory) => `${memory.title}\n\n${memory.content}`,
      );
      const vectors = await generateCliEmbeddings(texts);
      const writes = batch.map((memory, index) => {
        const vector = vectors[index];
        if (vector === undefined) {
          throw new Error(
            `missing embedding for memory at offset ${String(offset + index)}`,
          );
        }
        return { id: memory.id, embedding: vector };
      });
      await setEmbeddings(driver, writes);
    }

    console.log(
      `done: ${String(corpus.memories.length)} memories, ${String(corpus.relationships.length)} relationships · embeddings: ${embeddingMode()}`,
    );
  } finally {
    await session.close();
  }
}
