/**
 * Shared session + Cypher fragment helpers used across the memory service.
 *
 * - `withSession`: standard session lifecycle wrapper. Every CRUD/read
 *   helper opens a session on entry and closes it on exit.
 * - `logEvent`: append a :MemoryEvent node + :EVENT_FOR edge to a memory.
 *   Receives an active Session so the caller controls transaction scope.
 * - `profileFilter` / `visibleStatusClause`: Cypher fragment builders
 *   that previously lived as inline string-concat at 8+/10+ sites
 *   respectively. Centralizing means one edit to add a new status
 *   (e.g. "archived") and removes the prior `pf.clause.replace(/m\./g,
 *   "m2.")` hack in `getMemoryStats` — `profileFilter()` now takes the
 *   alias as a required argument.
 */

import crypto from "node:crypto";
import type { Driver, Session } from "neo4j-driver";

export async function withSession<T>(
  driver: Driver,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const session = driver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

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

/**
 * Build a Cypher fragment for "memory belongs to this profile, OR has no
 * profile assigned (legacy memories)". Prepends `AND ` so it can be
 * appended to an existing WHERE clause. Returns empty string + empty
 * params when profileId is null/undefined (the "no profile filter" case).
 *
 * `alias` is required and has no default — typo at call site fails review
 * rather than silently filtering on the wrong node variable.
 */
export function profileFilter(
  profileId: string | null | undefined,
  alias: string,
): FilterFragment {
  if (profileId === null || profileId === undefined) {
    return { clause: "", params: {} };
  }
  return {
    clause: `AND (${alias}.profileId = $profileId OR ${alias}.profileId IS NULL)`,
    params: { profileId },
  };
}

/**
 * The set of statuses considered "visible" to retrieval/search. Memories
 * with `status` outside this set (e.g. "suppressed", "expired") are
 * filtered out of all read paths.
 */
export const VISIBLE_STATUSES = ["active", "pinned"] as const;

/**
 * Build the WHERE-fragment that filters a memory variable to visible
 * statuses. `coalesce` defaults to `true` so that older Memory rows
 * written before the `status` field existed are treated as "active".
 * Set `coalesce=false` for new code paths that know the field is
 * always populated (slightly cheaper Cypher).
 */
export function visibleStatusClause(alias = "m", coalesce = true): string {
  if (coalesce) {
    return `coalesce(${alias}.status, 'active') IN ['active', 'pinned']`;
  }
  return `${alias}.status IN ['active', 'pinned']`;
}
