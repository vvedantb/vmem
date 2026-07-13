/**
 * Audit log read helpers. Writes go via `logEvent` (re-exported from
 * `shared.ts` for convenience).
 */

import type { Driver } from "neo4j-driver";
import { neo4jGet, parseNeo4jNodeProps } from "../record";
import { memoryEventPropsSchema, toEventFromNode } from "./mappers";
import { withSession } from "./shared";
import type { MemoryEvent } from "./types";

export { logEvent } from "./shared";

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

    return result.records.map((record) =>
      toEventFromNode(
        parseNeo4jNodeProps(neo4jGet(record, "e"), memoryEventPropsSchema),
      ),
    );
  });
}
