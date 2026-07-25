import crypto from "node:crypto";
import type { Session } from "neo4j-driver";

export async function logEvent(
  session: Session,
  memoryId: string,
  action: string,
  actor: string,
  details: Record<string, string>,
  snapshot: string | null = null,
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const result = await session.run(
    `MATCH (m:Memory {id: $memoryId})
     CREATE (e:MemoryEvent {
       id: $id,
       action: $action,
       actor: $actor,
       details: $details,
       snapshot: $snapshot,
       createdAt: $now
     })
     CREATE (e)-[:EVENT_FOR]->(m)
     RETURN e.id AS eventId`,
    {
      id,
      memoryId,
      action,
      actor,
      details: JSON.stringify(details),
      snapshot,
      now,
    },
  );
  console.log(
    `[logEvent] action=${action} memoryId=${memoryId} created=${result.records.length > 0}`,
  );
}

interface FilterFragment {
  clause: string;
  params: { profileId?: string };
}

export function profileFilter(
  profileId: string | null | undefined,
  alias: string,
  options?: { strict?: boolean },
): FilterFragment {
  if (profileId === null || profileId === undefined) {
    return { clause: "", params: {} };
  }
  if (options?.strict) {
    return {
      clause: `AND ${alias}.profileId = $profileId`,
      params: { profileId },
    };
  }
  return {
    clause: `AND (${alias}.profileId = $profileId OR ${alias}.profileId IS NULL)`,
    params: { profileId },
  };
}

export const CREATE_DERIVED_MEMORY_CYPHER = `
  CREATE (m:Memory {
    id: $id,
    userId: $userId,
    profileId: $profileId,
    title: $title,
    content: $content,
    type: 'knowledge',
    source: 'dream-mode',
    confidence: $confidence,
    status: 'active',
    createdAt: $now,
    updatedAt: $now,
    expiresAt: null,
    url: null,
    embedding: $embedding,
    contentHash: $contentHash,
    sourceType: null,
    sourceId: null,
    storageId: null,
    mimeType: null,
    originalFilename: null,
    visitCount: 1,
    firstVisitAt: $now,
    lastVisitAt: $now
  })
  WITH m
  MERGE (s:Source {name: 'dream-mode'})
  CREATE (m)-[:FROM_SOURCE]->(s)
  WITH m
  UNWIND $sourceMemoryIds AS sid
  MATCH (src:Memory {id: sid, userId: $userId})
  MERGE (m)-[:DERIVED_FROM]->(src)`;

const VISIBLE_STATUS_LIST = "'active', 'pinned'";

export function visibleStatusClause(alias = "m", coalesce = true): string {
  if (coalesce) {
    return `coalesce(${alias}.status, 'active') IN [${VISIBLE_STATUS_LIST}]`;
  }
  return `${alias}.status IN [${VISIBLE_STATUS_LIST}]`;
}
