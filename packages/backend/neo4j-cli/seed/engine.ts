import crypto from "node:crypto";
import { closeDriver, getDriver } from "../../engine/neo4j/driver";
import { deleteAllMemoriesForUser } from "../../engine/neo4j/memory/crud";
import { setEmbeddings } from "../../engine/neo4j/memory/migration";
import { setupDatabase } from "../../engine/neo4j/setup";
import { embeddingMode, generateCliEmbeddings } from "../eval/cliEmbeddings";
import type { SeedEvent, SeedMemory, SeedRelationship } from "./types";

const MS_PER_DAY = 86_400_000;

/** Memory indices that also get a synthetic "updated" event after create. */
const UPDATED_MEMORY_INDICES = [
  3, 10, 22, 27, 35, 48, 55, 68, 78, 95, 116, 130, 145, 155, 178, 190, 201, 213,
  237, 248,
];

export interface RunSeedOptions {
  userIds: string[];
  templateMemories: SeedMemory[];
  templateRelationships: SeedRelationship[];
  embedAfterInsert: boolean;
  logLabel?: string;
  /** Remove existing rows for listed users before insert (default true). */
  clearUsersBeforeInsert?: boolean;
}

function remapId(idMap: Map<string, string>, oldId: string): string {
  const newId = idMap.get(oldId);
  if (newId === undefined) throw new Error(`unmapped id: ${oldId}`);
  return newId;
}

export function buildEvents(memories: SeedMemory[]): SeedEvent[] {
  const events: SeedEvent[] = memories.map((memory) => ({
    eventId: crypto.randomUUID(),
    memoryId: memory.id,
    action: "created",
    createdAt: memory.createdAt,
  }));

  for (const index of UPDATED_MEMORY_INDICES) {
    const memory = memories[index];
    if (!memory) continue;
    const createdMs = new Date(memory.createdAt).getTime();
    events.push({
      eventId: crypto.randomUUID(),
      memoryId: memory.id,
      action: "updated",
      createdAt: new Date(
        createdMs + (1 + Math.random() * 5) * MS_PER_DAY,
      ).toISOString(),
    });
  }

  return events;
}

async function embedMemories(
  memories: Array<{ id: string; title: string; content: string }>,
): Promise<void> {
  const BATCH = 20;
  console.log(`  embedding ${String(memories.length)} memories...`);

  for (let offset = 0; offset < memories.length; offset += BATCH) {
    const batch = memories.slice(offset, offset + BATCH);
    const texts = batch.map((memory) => `${memory.title}\n\n${memory.content}`);
    const vectors = await generateCliEmbeddings(texts);
    const writes = batch.map((memory, index) => {
      const vector = vectors[index];
      if (!vector) {
        throw new Error(
          `missing embedding for memory at offset ${String(offset + index)}`,
        );
      }
      return { id: memory.id, embedding: vector };
    });

    await setEmbeddings(getDriver(), writes);
  }
}

export async function runSeed(options: RunSeedOptions): Promise<void> {
  console.log("connecting to Neo4j...");
  const driver = getDriver();
  const session = driver.session();

  try {
    console.log("ensuring indexes and constraints...");
    await setupDatabase(driver);

    if (options.clearUsersBeforeInsert ?? true) {
      for (const userId of options.userIds) {
        const deleted = await deleteAllMemoriesForUser(driver, userId);
        console.log(
          `cleared ${String(deleted)} existing memories for ${userId}`,
        );
      }
    }

    let totalMemories = 0;
    let totalRelationships = 0;
    let totalEvents = 0;

    if (options.logLabel) {
      console.log(options.logLabel);
    }

    for (const userId of options.userIds) {
      console.log(`\nseeding user: ${userId}`);

      const idMap = new Map<string, string>();
      const userMemories = options.templateMemories.map((memory) => {
        const newId = crypto.randomUUID();
        idMap.set(memory.id, newId);
        return { ...memory, id: newId, userId };
      });

      const userRelationships = options.templateRelationships.map(
        (relationship) => ({
          sourceId: remapId(idMap, relationship.sourceId),
          targetId: remapId(idMap, relationship.targetId),
          reason: relationship.reason,
        }),
      );

      const userEvents = buildEvents(userMemories);

      console.log(`  inserting ${String(userMemories.length)} memories...`);
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

      console.log(
        `  creating ${String(userRelationships.length)} relationships...`,
      );
      await session.run(
        `UNWIND $rels AS rel
         MATCH (a:Memory {id: rel.sourceId})
         MATCH (b:Memory {id: rel.targetId})
         CREATE (a)-[:RELATES_TO {reason: rel.reason}]->(b)`,
        { rels: userRelationships },
      );

      console.log(`  creating ${String(userEvents.length)} events...`);
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
    console.log(`  memories: ${String(totalMemories)}`);
    console.log(`  relationships: ${String(totalRelationships)}`);
    console.log(`  events: ${String(totalEvents)}`);
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
