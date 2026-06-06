import crypto from "node:crypto";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { setEmbeddings } from "../../engine/neo4j/memory/migration";
import { setupDatabase } from "../../engine/neo4j/setup";
import { embeddingMode, generateCliEmbeddings } from "../eval/cliEmbeddings";
import type { SeedEvent, SeedMemory, SeedRelationship } from "./types";

export interface RunSeedOptions {
  userIds: string[];
  templateMemories: SeedMemory[];
  templateRelationships: SeedRelationship[];
  embedAfterInsert: boolean;
  logLabel?: string;
}

function remapId(idMap: Map<string, string>, oldId: string): string {
  const newId = idMap.get(oldId);
  if (newId === undefined) throw new Error(`unmapped id: ${oldId}`);
  return newId;
}

export function buildEvents(mems: SeedMemory[]): SeedEvent[] {
  const events: SeedEvent[] = [];

  for (const m of mems) {
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: m.id,
      action: "created",
      createdAt: m.createdAt,
    });
  }

  const updatedIndices = [
    3, 10, 22, 27, 35, 48, 55, 68, 78, 95, 116, 130, 145, 155, 178, 190, 201,
    213, 237, 248,
  ];
  for (const idx of updatedIndices) {
    const m = mems[idx];
    if (!m) continue;
    const createdMs = new Date(m.createdAt).getTime();
    const laterMs = createdMs + (1 + Math.random() * 5) * 86400000;
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: m.id,
      action: "updated",
      createdAt: new Date(laterMs).toISOString(),
    });
  }

  return events;
}

async function embedMemories(
  memoriesToEmbed: Array<{ id: string; title: string; content: string }>,
): Promise<void> {
  const BATCH = 20;
  console.log(`  embedding ${String(memoriesToEmbed.length)} memories...`);

  for (let offset = 0; offset < memoriesToEmbed.length; offset += BATCH) {
    const batch = memoriesToEmbed.slice(offset, offset + BATCH);
    const texts = batch.map((memory) => `${memory.title}\n\n${memory.content}`);
    const vectors = await generateCliEmbeddings(texts);
    const writes: Array<{ id: string; embedding: number[] }> = [];

    for (let index = 0; index < batch.length; index++) {
      const memory = batch[index];
      const vector = vectors[index];
      if (!memory || !vector) {
        throw new Error(
          `missing embedding for memory at offset ${String(offset + index)}`,
        );
      }
      writes.push({ id: memory.id, embedding: vector });
    }

    await setEmbeddings(getDriver(), writes);
  }
}

export async function runSeed(options: RunSeedOptions): Promise<void> {
  console.log("connecting to Neo4j...");
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log("wiping all data...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("recreating indexes and constraints...");
    await setupDatabase(driver);

    let totalMemories = 0;
    let totalRelationships = 0;
    let totalEvents = 0;

    if (options.logLabel) {
      console.log(options.logLabel);
    }

    for (const userId of options.userIds) {
      console.log(`\nseeding user: ${userId}`);

      const idMap = new Map<string, string>();
      const userMemories = options.templateMemories.map((m) => {
        const newId = crypto.randomUUID();
        idMap.set(m.id, newId);
        return { ...m, id: newId, userId };
      });

      const userRelationships = options.templateRelationships.map((r) => ({
        sourceId: remapId(idMap, r.sourceId),
        targetId: remapId(idMap, r.targetId),
        reason: r.reason,
      }));

      const userEvents = buildEvents(userMemories);

      console.log(`  inserting ${userMemories.length} memories...`);
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
        { memories: userMemories },
      );

      console.log(`  creating ${userRelationships.length} relationships...`);
      await session.run(
        `UNWIND $rels AS rel
         MATCH (a:Memory {id: rel.sourceId})
         MATCH (b:Memory {id: rel.targetId})
         CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
        { rels: userRelationships },
      );

      console.log(`  creating ${userEvents.length} events...`);
      await session.run(
        `UNWIND $events AS evt
         MATCH (m:Memory {id: evt.memoryId})
         CREATE (e:MemoryEvent {
           id: evt.eventId,
           action: evt.action,
           actor: 'system',
           details: '{}',
           snapshot: null,
           createdAt: evt.createdAt
         })
         CREATE (e)-[:EVENT_FOR]->(m)`,
        { events: userEvents },
      );

      totalMemories += userMemories.length;
      totalRelationships += userRelationships.length;
      totalEvents += userEvents.length;

      if (options.embedAfterInsert) {
        await embedMemories(userMemories);
      }
    }

    console.log("\ndone!");
    console.log(`  users: ${String(options.userIds.length)}`);
    console.log(`  memories: ${totalMemories}`);
    console.log(`  relationships: ${totalRelationships}`);
    console.log(`  events: ${totalEvents}`);
    if (options.embedAfterInsert) {
      console.log(
        `  embeddings: ${String(totalMemories)} (${embeddingMode()})`,
      );
    }
  } finally {
    await session.close();
    await closeDriver();
  }
}
