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

export interface FilterFragment {
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

export const VISIBLE_STATUSES = ["active", "pinned"] as const;

export function visibleStatusClause(alias = "m", coalesce = true): string {
  const list = VISIBLE_STATUSES.map((s) => `'${s}'`).join(", ");
  if (coalesce) {
    return `coalesce(${alias}.status, 'active') IN [${list}]`;
  }
  return `${alias}.status IN [${list}]`;
}
