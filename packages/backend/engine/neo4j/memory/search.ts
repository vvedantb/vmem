/**
 * Search-style reads. `searchMemories` is a thin wrapper around
 * `listMemories` (kept here so the public action surface stays stable for
 * MCP tools / CommandPalette). `getRecentMemoryTitles` feeds the
 * relationship-suggestion picker.
 *
 * The hybrid retrieve (BM25 + vector + graph + RRF) lives in `retrieve.ts`,
 * not here.
 */

import neo4j, { type Driver } from "neo4j-driver";
import { listMemories } from "./crud";
import { visibleStatusClause, withSession } from "./shared";
import type { MemoryType, MemoryWithTags } from "./types";

export async function searchMemories(
  driver: Driver,
  params: {
    userId: string;
    profileId?: string | null;
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  // Funnels every filter (profile, type, status, tags, source, fulltext)
  // through the single Cypher path in listMemories. Fixes the old bugs where
  // search ignored type/status/tag filters and returned total = page.length.
  return listMemories(driver, {
    userId: params.userId,
    profileId: params.profileId,
    type: params.type,
    tags: params.tags,
    source: params.source,
    searchQuery: params.query,
    limit: params.limit,
    offset: params.offset,
  });
}

export async function getRecentMemoryTitles(
  driver: Driver,
  userId: string,
  excludeId: string,
  limit = 30,
): Promise<Array<{ id: string; title: string }>> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.id <> $excludeId AND ${visibleStatusClause("m", false)}
       RETURN m.id AS id, m.title AS title
       ORDER BY m.updatedAt DESC
       LIMIT $limit`,
      { userId, excludeId, limit: neo4j.int(limit) },
    );
    return result.records.map((r) => ({
      id: String(r.get("id")),
      title: String(r.get("title")),
    }));
  });
}
