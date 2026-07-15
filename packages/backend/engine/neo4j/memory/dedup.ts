import type { Driver, Record as NeoRecord, Session } from "neo4j-driver";
import { neo4jGet, neo4jString, parseNeo4jInt } from "../record";
import { normalizeUrl } from "../url";
import {
  createMemory,
  findMemoryByContentHash,
  findMemoryByExternalId,
  findMemoryBySimilarity,
  findMemoryByTitleAndOrigin,
  findMemoryByUrl,
  shortCircuitOnDedupMatch,
  type MemoryRef,
} from "./crud";
import { computeContentHash } from "./mappers";
import { withSession } from "../session";
import type { MemoryType, MemoryWithTags } from "./types";

const BROWSER_SOURCES: ReadonlySet<string> = new Set([
  "browsing-history",
  "bookmarks",
]);

const SEMANTIC_DEDUP_THRESHOLD = 0.95;

export interface CreateWithDedupParams {
  userId: string;
  profileId: string;
  title: string;
  content: string;
  type: MemoryType;
  source: string;
  tags: string[];
  confidence: number;
  expiresAt?: string;
  url?: string;
  externalId?: string;
  sourceType?: string;
  storageId?: string;
  mimeType?: string;
  originalFilename?: string;
  // called only after exact-match checks miss
  embed: () => Promise<number[] | null>;
}

// create-memory path with ordered dedup short-circuits
export async function resolveCreateWithDedup(
  driver: Driver,
  params: CreateWithDedupParams,
): Promise<{ memory: MemoryWithTags; created: boolean }> {
  const normalizedUrl = params.url
    ? (normalizeUrl(params.url) ?? undefined)
    : undefined;

  async function checkDuplicate(
    finder: () => Promise<MemoryRef | null>,
  ): Promise<MemoryWithTags | null> {
    return shortCircuitOnDedupMatch(driver, params.userId, await finder());
  }

  if (params.externalId && params.sourceType) {
    const sourceType = params.sourceType;
    const externalId = params.externalId;
    const hit = await checkDuplicate(() =>
      findMemoryByExternalId(driver, params.userId, sourceType, externalId),
    );
    if (hit) return { memory: hit, created: false };
  }

  if (normalizedUrl) {
    const hit = await checkDuplicate(() =>
      findMemoryByUrl(driver, params.userId, normalizedUrl),
    );
    if (hit) return { memory: hit, created: false };
  }

  if (normalizedUrl && BROWSER_SOURCES.has(params.source)) {
    try {
      const origin = new URL(normalizedUrl).origin;
      const hit = await checkDuplicate(() =>
        findMemoryByTitleAndOrigin(driver, params.userId, params.title, origin),
      );
      if (hit) return { memory: hit, created: false };
    } catch {
      // invalid URL, skip this check
    }
  }

  const contentHash = computeContentHash(params.title, params.content);
  const hashHit = await checkDuplicate(() =>
    findMemoryByContentHash(driver, params.userId, contentHash),
  );
  if (hashHit) return { memory: hashHit, created: false };

  const embedding = await params.embed();

  if (embedding) {
    const semanticMatch = await findMemoryBySimilarity(
      driver,
      params.userId,
      embedding,
      SEMANTIC_DEDUP_THRESHOLD,
    );
    if (semanticMatch) {
      console.log(
        `[dedup] semantic near-duplicate (similarity=${semanticMatch.similarity.toFixed(3)}) → ${semanticMatch.id}`,
      );
    }
    const semanticHit = await shortCircuitOnDedupMatch(
      driver,
      params.userId,
      semanticMatch,
    );
    if (semanticHit) return { memory: semanticHit, created: false };
  }

  const memory = await createMemory(driver, {
    userId: params.userId,
    profileId: params.profileId,
    title: params.title,
    content: params.content,
    type: params.type,
    source: params.source,
    tags: params.tags,
    confidence: params.confidence,
    expiresAt: params.expiresAt,
    url: normalizedUrl,
    embedding,
    contentHash,
    sourceType: params.sourceType,
    sourceId: params.externalId,
    storageId: params.storageId,
    mimeType: params.mimeType,
    originalFilename: params.originalFilename,
  });

  return { memory, created: true };
}

interface DuplicateGroup {
  survivorId: string;
  duplicateIds: string[];
  extraVisits: number;
}

function parseDuplicateGroup(record: NeoRecord): DuplicateGroup {
  const rawIds = neo4jGet(record, "duplicateIds");
  return {
    survivorId: neo4jString(record, "survivorId"),
    duplicateIds: Array.isArray(rawIds) ? rawIds.map(String) : [],
    extraVisits: parseNeo4jInt(neo4jGet(record, "extraVisits")),
  };
}

async function mergeDuplicateGroup(
  session: Session,
  group: DuplicateGroup,
): Promise<number> {
  const { survivorId, duplicateIds, extraVisits } = group;

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:TAGGED_WITH]->(t:Tag)
     WHERE NOT (survivor)-[:TAGGED_WITH]->(t)
     MERGE (survivor)-[:TAGGED_WITH]->(t)`,
    { survivorId, duplicateIds },
  );

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[r:RELATES_TO]->(target)
     WHERE target.id <> $survivorId
       AND NOT (survivor)-[:RELATES_TO]->(target)
     MERGE (survivor)-[nr:RELATES_TO]->(target)
     ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
    { survivorId, duplicateIds },
  );
  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (source)-[r:RELATES_TO]->(dup:Memory {id: dupId})
     WHERE source.id <> $survivorId
       AND NOT (source)-[:RELATES_TO]->(survivor)
     MERGE (source)-[nr:RELATES_TO]->(survivor)
     ON CREATE SET nr.reason = r.reason, nr.score = r.score`,
    { survivorId, duplicateIds },
  );

  await session.run(
    `MATCH (survivor:Memory {id: $survivorId})
     UNWIND $duplicateIds AS dupId
     MATCH (dup:Memory {id: dupId})-[:MENTIONS]->(e:Entity)
     WHERE NOT (survivor)-[:MENTIONS]->(e)
     MERGE (survivor)-[:MENTIONS]->(e)`,
    { survivorId, duplicateIds },
  );

  if (extraVisits > 0) {
    await session.run(
      `MATCH (m:Memory {id: $survivorId})
       SET m.visitCount = coalesce(m.visitCount, 1) + $extraVisits`,
      { survivorId, extraVisits },
    );
  }

  await session.run(
    `UNWIND $duplicateIds AS dupId
     MATCH (m:Memory {id: dupId})
     DETACH DELETE m`,
    { duplicateIds },
  );

  return duplicateIds.length;
}

async function mergeAllGroups(
  session: Session,
  groups: NeoRecord[],
): Promise<number> {
  let totalDeleted = 0;
  for (const record of groups) {
    totalDeleted += await mergeDuplicateGroup(
      session,
      parseDuplicateGroup(record),
    );
  }
  return totalDeleted;
}

export async function deduplicateMemories(
  driver: Driver,
  userId: string,
): Promise<number> {
  return withSession(driver, async (session) => {
    const groups = await session.run(
      `MATCH (m:Memory {userId: $userId})
       WHERE m.contentHash IS NOT NULL
       WITH m.contentHash AS hash, m ORDER BY m.createdAt ASC
       WITH hash, collect(m) AS sorted
       WHERE size(sorted) > 1
       RETURN hash,
              head(sorted).id AS survivorId,
              [m IN tail(sorted) | m.id] AS duplicateIds,
              reduce(total = 0, m IN tail(sorted) | total + coalesce(m.visitCount, 1)) AS extraVisits`,
      { userId },
    );
    return mergeAllGroups(session, groups.records);
  });
}
