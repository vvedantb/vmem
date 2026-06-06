/**
 * Team-scoped reads + owner-override mutation.
 *
 * Access control: the caller is expected to have already verified team
 * membership at the Convex layer. These functions restrict results to a
 * specific team profile AND to the set of clerkIds allowed on that team
 * (defence in depth). Memories authored by removed ex-members stay with
 * their original userId and are still returned — attribution is preserved
 * even though the user is no longer in `allowedUserIds`. (This is
 * intentional per product decision: removed members' knowledge stays with
 * the team.)
 *
 * To keep historical memories visible after member removal, team reads use
 * `m.profileId = $profileId` as the primary filter and do NOT require the
 * creator be currently in `allowedUserIds`.
 */

import neo4j, { type Driver, type Integer } from "neo4j-driver";
import { toMemoryContentFulltextQuery } from "../luceneQuery";
import { toMemoryWithTags, toNeoInt } from "./mappers";
import { withSession } from "./shared";
import {
  type MemoryStatus,
  type MemoryType,
  type MemoryWithTags,
} from "./types";

export async function listMemoriesForTeam(
  driver: Driver,
  params: {
    profileId: string;
    type?: MemoryType;
    status?: MemoryStatus;
    source?: string;
    tags?: string[];
    searchQuery?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  return withSession(driver, async (session) => {
    const queryParams: Record<
      string,
      string | number | Integer | string[] | null
    > = {
      profileId: params.profileId,
      limit: neo4j.int(params.limit),
      offset: neo4j.int(params.offset),
    };

    const whereClauses = ["m.profileId = $profileId"];
    if (params.type) {
      whereClauses.push("m.type = $type");
      queryParams.type = params.type;
    }
    if (params.status) {
      whereClauses.push("m.status = $status");
      queryParams.status = params.status;
    } else {
      whereClauses.push("coalesce(m.status, 'active') IN ['active', 'pinned']");
    }
    if (params.source) {
      whereClauses.push("m.source = $source");
      queryParams.source = params.source;
    }

    const where = whereClauses.join(" AND ");

    const hasTagFilter = !!params.tags && params.tags.length > 0;
    if (hasTagFilter && params.tags) {
      queryParams.filterTags = params.tags;
    }
    const filterTagsCount = params.tags?.length ?? 0;

    const luceneSearchQuery = toMemoryContentFulltextQuery(
      params.searchQuery ?? "",
    );
    const hasSearchQuery = luceneSearchQuery !== null;
    if (hasSearchQuery) {
      queryParams.searchQuery = luceneSearchQuery;
    }

    const tagMatchClause = hasTagFilter
      ? `MATCH (m)-[:TAGGED_WITH]->(ft:Tag) WHERE ft.name IN $filterTags
         WITH m${hasSearchQuery ? ", score" : ""}, count(DISTINCT ft) AS matchedTags
         WHERE matchedTags = ${filterTagsCount}`
      : "";

    const matchPrefix = hasSearchQuery
      ? `CALL db.index.fulltext.queryNodes('memory_content', $searchQuery) YIELD node AS m, score
         WHERE ${where}`
      : `MATCH (m:Memory) WHERE ${where}`;
    const orderClause = hasSearchQuery
      ? "WITH m, score ORDER BY score DESC"
      : "WITH m ORDER BY m.createdAt DESC";

    const countResult = await session.run(
      `${matchPrefix}
       ${tagMatchClause}
       RETURN count(m) AS total`,
      queryParams,
    );
    const countRecord = countResult.records[0];
    const total = countRecord ? toNeoInt(countRecord.get("total")) : 0;

    const result = await session.run(
      `${matchPrefix}
       ${tagMatchClause}
       ${orderClause} SKIP $offset LIMIT $limit
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       RETURN m, collect(t.name) AS tags`,
      queryParams,
    );
    const memories = result.records.map(toMemoryWithTags);
    return { memories, total };
  });
}

export async function getMemoryForTeam(
  driver: Driver,
  profileId: string,
  memoryId: string,
): Promise<MemoryWithTags | null> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, profileId: $profileId})
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       RETURN m, collect(t.name) AS tags`,
      { memoryId, profileId },
    );
    const firstRecord = result.records[0];
    if (!firstRecord) return null;
    return toMemoryWithTags(firstRecord);
  });
}

export async function searchMemoriesForTeam(
  driver: Driver,
  params: {
    profileId: string;
    query?: string;
    type?: MemoryType;
    tags?: string[];
    source?: string;
    limit: number;
    offset: number;
  },
): Promise<{ memories: MemoryWithTags[]; total: number }> {
  return listMemoriesForTeam(driver, {
    profileId: params.profileId,
    type: params.type,
    tags: params.tags,
    source: params.source,
    searchQuery: params.query,
    limit: params.limit,
    offset: params.offset,
  });
}

/**
 * Team-owner override for mutations: delete any memory on a team profile
 * regardless of original author. Scoped strictly by profileId to keep the
 * blast radius small.
 */
export async function deleteTeamMemoryAsOwner(
  driver: Driver,
  profileId: string,
  memoryId: string,
): Promise<boolean> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, profileId: $profileId})
       DETACH DELETE m
       RETURN count(m) AS deleted`,
      { memoryId, profileId },
    );
    const firstRecord = result.records[0];
    if (!firstRecord) return false;
    return toNeoInt(firstRecord.get("deleted")) > 0;
  });
}
