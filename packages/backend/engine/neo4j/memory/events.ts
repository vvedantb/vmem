import type { Driver } from "neo4j-driver";
import { toEventFromRecord } from "./mappers";
import { withSession } from "./shared";
import type { MemoryEvent } from "./types";

export async function getMemoryEvents(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<MemoryEvent[]> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})<-[:EVENT_FOR]-(e:MemoryEvent)
       RETURN e
       ORDER BY e.createdAt DESC`,
      { memoryId, userId },
    );

    return result.records.map(toEventFromRecord);
  });
}
