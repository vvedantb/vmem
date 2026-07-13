import type { Driver, Record as NeoRecord, Session } from "neo4j-driver";
import { z } from "zod";
import { clampNeo4jLimit } from "../intParams";
import { neo4jGet, parseNeo4jInt } from "../record";
import { toMemoryTypeOrUndefined, toTagEdge } from "./mappers";
import { profileFilter, visibleStatusClause, withSession } from "./shared";
import type { MemoryType, TagEdge } from "./types";

const graphNodeRowSchema = z.object({
  id: z.unknown().transform(String),
  title: z.unknown().transform(String),
  tags: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : [])),
  createdAt: z.unknown().transform(String),
  source: z.coerce
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  sourceType: z.coerce
    .string()
    .nullish()
    .transform((v) => v ?? null),
  type: z
    .unknown()
    .transform((v) =>
      toMemoryTypeOrUndefined(typeof v === "string" ? v : null),
    ),
});

const relatesToEdgeRowSchema = z.object({
  source: z.unknown().transform(String),
  target: z.unknown().transform(String),
  reason: z.coerce
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  score: z
    .unknown()
    .transform((v) => (v === null || v === undefined ? undefined : Number(v))),
});

const entityRowSchema = z.object({
  normalizedName: z.unknown().transform(String),
  name: z.unknown().transform(String),
  type: z.unknown().transform(String),
  memoryIds: z
    .unknown()
    .transform((v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : [])),
});

function parseGraphNodeRow(n: unknown): GraphNode | null {
  const parsed = graphNodeRowSchema.safeParse(n);
  return parsed.success ? parsed.data : null;
}

function parseRelatesToEdgeRow(raw: unknown): RelatesToEdge | null {
  const parsed = relatesToEdgeRowSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseEntityRow(raw: unknown): GraphData["entities"][number] | null {
  const parsed = entityRowSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function rowFromRecord(
  r: NeoRecord,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    out[k] = neo4jGet(r, k);
  }
  return out;
}

export const GLOBAL_GRAPH_MAX_NODES = 5000;
export const GLOBAL_GRAPH_DEFAULT_LIMIT = 500;

export interface GraphCursor {
  createdAt: string;
  id: string;
}

interface GraphNode {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  source?: string;
  sourceType: string | null;
  type?: MemoryType;
}

interface RelatesToEdge {
  source: string;
  target: string;
  reason: string;
  score?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  relatesToEdges: RelatesToEdge[];
  tagEdges: TagEdge[];
  entities: Array<{
    normalizedName: string;
    name: string;
    type: string;
    memoryIds: string[];
  }>;
  focusNodeId?: string;
  totalMemoryCount?: number;
  nextCursor?: GraphCursor;
}

async function fetchGraphNodesAndEdges(
  session: Session,
  userId: string,
  profileId: string | null | undefined,
  nodeLimit: number,
  cursor: GraphCursor | null,
): Promise<{
  nodes: GraphNode[];
  relatesToEdges: RelatesToEdge[];
  entities: GraphData["entities"];
  totalMemoryCount: number | undefined;
  nextCursor: GraphCursor | undefined;
}> {
  const pf = profileFilter(profileId, "m");
  const limit = Math.max(
    1,
    Math.min(
      GLOBAL_GRAPH_MAX_NODES,
      Math.trunc(nodeLimit || GLOBAL_GRAPH_DEFAULT_LIMIT),
    ),
  );
  const cursorClause = cursor
    ? `AND (m.createdAt < $cursorCreatedAt
         OR (m.createdAt = $cursorCreatedAt AND m.id < $cursorId))`
    : "";
  const countLeg = cursor
    ? ""
    : `CALL () {
         MATCH (m:Memory {userId: $userId})
         WHERE ${visibleStatusClause("m")} ${pf.clause}
         RETURN count(m) AS totalMemoryCount
       }`;

  const result = await session.run(
    `CALL () {
       MATCH (m:Memory {userId: $userId})
       WHERE ${visibleStatusClause("m")} ${pf.clause}
       ${cursorClause}
       WITH m ORDER BY m.createdAt DESC, m.id DESC LIMIT $nodeLimit
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, collect(t.name) AS memTags
       RETURN collect({
         id: m.id, title: m.title, tags: memTags,
         createdAt: m.createdAt, source: m.source,
         type: m.type, sourceType: m.sourceType
       }) AS nodes,
       collect(m.id) AS nodeIds
     }
     CALL (nodeIds) {
       MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
       WHERE a.id IN nodeIds AND b.userId = $userId
       RETURN collect({source: a.id, target: b.id, reason: r.reason, score: r.score}) AS outEdges
     }
     CALL (nodeIds) {
       MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
       WHERE b.id IN nodeIds AND a.userId = $userId
       RETURN collect({source: a.id, target: b.id, reason: r.reason, score: r.score}) AS inEdges
     }
     CALL (nodeIds) {
       MATCH (m:Memory)-[:MENTIONS]->(e:Entity)
       WHERE m.id IN nodeIds
       WITH e, collect(m.id) AS memoryIds
       RETURN collect({
         normalizedName: e.normalizedName, name: e.name,
         type: e.type, memoryIds: memoryIds
       }) AS entities
     }
     ${countLeg}
     RETURN nodes, outEdges, inEdges, entities${cursor ? "" : ", totalMemoryCount"}`,
    {
      userId,
      nodeLimit: clampNeo4jLimit(
        limit,
        GLOBAL_GRAPH_DEFAULT_LIMIT,
        GLOBAL_GRAPH_MAX_NODES,
      ),
      ...(cursor
        ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id }
        : {}),
      ...pf.params,
    },
  );

  const row = result.records[0];
  const rawNodes = row ? neo4jGet(row, "nodes") : [];
  const rawOutEdges = row ? neo4jGet(row, "outEdges") : [];
  const rawInEdges = row ? neo4jGet(row, "inEdges") : [];
  const rawEntities = row ? neo4jGet(row, "entities") : [];
  const totalMemoryCount =
    row && !cursor
      ? parseNeo4jInt(neo4jGet(row, "totalMemoryCount"))
      : undefined;

  const nodes: GraphNode[] = (Array.isArray(rawNodes) ? rawNodes : [])
    .map(parseGraphNodeRow)
    .filter((n): n is GraphNode => n !== null);

  const relatesToEdges: RelatesToEdge[] = [];
  const seenPairs = new Set<string>();
  for (const raw of [rawOutEdges, rawInEdges]) {
    for (const e of Array.isArray(raw) ? raw : []) {
      const parsed = parseRelatesToEdgeRow(e);
      if (!parsed) continue;
      const key = `${parsed.source}|${parsed.target}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      relatesToEdges.push({
        source: parsed.source,
        target: parsed.target,
        reason: parsed.reason,
      });
    }
  }

  const entities: GraphData["entities"] = (
    Array.isArray(rawEntities) ? rawEntities : []
  ).flatMap((e) => {
    const parsed = parseEntityRow(e);
    return parsed ? [parsed] : [];
  });

  const last = nodes.length === limit ? nodes[nodes.length - 1] : undefined;
  const nextCursor = last
    ? { createdAt: last.createdAt, id: last.id }
    : undefined;

  return { nodes, relatesToEdges, entities, totalMemoryCount, nextCursor };
}

async function fetchTagSharedEdges(
  session: Session,
  userId: string,
  profileId: string | null | undefined,
): Promise<TagEdge[]> {
  const pf = profileFilter(profileId, "m");
  const result = await session.run(
    `MATCH (m:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag)
     WHERE ${visibleStatusClause("m")} ${pf.clause}
     WITH t, collect(m) AS memsForTag, count(*) AS userTagCount
     WHERE userTagCount >= 2 AND userTagCount <= 500
     UNWIND memsForTag AS m1
     UNWIND memsForTag AS m2
     WITH m1, m2, t WHERE m1.id < m2.id
     WITH m1, m2, collect(DISTINCT t.name) AS sharedTagsAll
     WITH m1, m2, sharedTagsAll, size(sharedTagsAll) AS weight
     WHERE weight >= 2
     RETURN m1.id AS source, m2.id AS target, weight,
            sharedTagsAll[..5] AS sharedTags
     ORDER BY weight DESC
     LIMIT 5000`,
    { userId, ...pf.params },
  );
  return result.records.map(toTagEdge);
}

export async function getGraphData(
  driver: Driver,
  userId: string,
  profileId?: string | null,
  nodeLimit: number = GLOBAL_GRAPH_MAX_NODES,
  cursor: GraphCursor | null = null,
): Promise<GraphData> {
  const nodesEdgesSession = driver.session();
  const tagEdgesSession = cursor === null ? driver.session() : null;
  try {
    const [nodesAndEdges, tagEdges] = await Promise.all([
      fetchGraphNodesAndEdges(
        nodesEdgesSession,
        userId,
        profileId,
        nodeLimit,
        cursor,
      ),
      tagEdgesSession
        ? fetchTagSharedEdges(tagEdgesSession, userId, profileId)
        : Promise.resolve<TagEdge[]>([]),
    ]);
    return { ...nodesAndEdges, tagEdges };
  } finally {
    await Promise.all([
      nodesEdgesSession.close(),
      ...(tagEdgesSession ? [tagEdgesSession.close()] : []),
    ]);
  }
}

export async function getMemoryContent(
  driver: Driver,
  userId: string,
  memoryId: string,
): Promise<string> {
  return withSession(driver, async (session) => {
    const result = await session.run(
      `MATCH (m:Memory {id: $memoryId, userId: $userId})
       RETURN m.content AS content`,
      { userId, memoryId },
    );
    const first = result.records[0];
    if (!first) return "";
    const value = neo4jGet(first, "content");
    return typeof value === "string" ? value : "";
  });
}

export async function getLocalGraph(
  driver: Driver,
  userId: string,
  focusId: string | null,
  profileId?: string | null,
  depth: number = 2,
): Promise<GraphData> {
  const nodesSession = driver.session();
  let nodeIds: string[];
  let nodes: GraphNode[];
  let resolvedFocusId: string | undefined;

  const pfFocus = profileFilter(profileId, "focus");
  const pfB = profileFilter(profileId, "b");

  const hops = Math.min(3, Math.max(1, Math.trunc(depth)));

  const focusMatch =
    focusId !== null
      ? `MATCH (focus:Memory {id: $focusId, userId: $userId})
         WHERE ${visibleStatusClause("focus")} ${pfFocus.clause}`
      : `MATCH (focus:Memory {userId: $userId})
         WHERE ${visibleStatusClause("focus")} ${pfFocus.clause}
         WITH focus ORDER BY focus.createdAt DESC LIMIT 1`;

  try {
    const nodesResult = await nodesSession.run(
      `${focusMatch}
       OPTIONAL MATCH (focus)
         ((a:Memory WHERE ${visibleStatusClause("a")})
          -[:RELATES_TO]-
          (b:Memory WHERE ${visibleStatusClause("b")}
             AND b.userId = $userId
             ${pfB.clause})
         ){1,${hops}}
         (neighbor:Memory)
       WITH focus, collect(DISTINCT neighbor) AS neighbors
       WITH focus.id AS focusId, [focus] + neighbors AS allNodes
       UNWIND allNodes AS m
       WITH DISTINCT m, focusId LIMIT 500
       OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
       WITH m, focusId, collect(t.name) AS tags
       RETURN m.id AS id, m.title AS title,
              tags, m.createdAt AS createdAt,
              m.source AS source, m.type AS type,
              m.sourceType AS sourceType, focusId`,
      {
        userId,
        ...(focusId !== null ? { focusId } : {}),
        ...pfFocus.params,
      },
    );

    const firstRecord = nodesResult.records[0];
    resolvedFocusId = firstRecord
      ? String(neo4jGet(firstRecord, "focusId"))
      : undefined;

    nodes = nodesResult.records.flatMap((r) => {
      const node = parseGraphNodeRow(
        rowFromRecord(r, [
          "id",
          "title",
          "tags",
          "createdAt",
          "source",
          "type",
          "sourceType",
        ] as const),
      );
      return node === null ? [] : [node];
    });
    nodeIds = nodes.map((n) => n.id);
  } finally {
    await nodesSession.close();
  }

  if (nodeIds.length === 0) {
    return {
      nodes: [],
      relatesToEdges: [],
      tagEdges: [],
      entities: [],
      focusNodeId: resolvedFocusId,
    };
  }

  const relatesToSession = driver.session();
  const tagEdgesSession = driver.session();
  const entitySession = driver.session();
  try {
    const [relatesToResult, tagEdgesResult, entityResult] = await Promise.all([
      relatesToSession.run(
        `MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
         WHERE a.id IN $nodeIds AND b.id IN $nodeIds
         RETURN a.id AS source, b.id AS target, r.reason AS reason, r.score AS score`,
        { nodeIds },
      ),
      tagEdgesSession.run(
        `MATCH (m1:Memory)-[:TAGGED_WITH]->(t:Tag)<-[:TAGGED_WITH]-(m2:Memory)
         WHERE m1.id IN $nodeIds AND m2.id IN $nodeIds AND m1.id < m2.id
         WITH m1, m2, collect(DISTINCT t.name) AS sharedTagsAll
         WITH m1, m2, sharedTagsAll, size(sharedTagsAll) AS weight
         WHERE weight >= 2
         RETURN m1.id AS source, m2.id AS target, weight,
                sharedTagsAll[..5] AS sharedTags
         ORDER BY weight DESC
         LIMIT 2000`,
        { nodeIds },
      ),
      entitySession.run(
        `MATCH (m:Memory)-[:MENTIONS]->(e:Entity)
         WHERE m.id IN $nodeIds
         WITH e, collect(m.id) AS memoryIds
         RETURN e.normalizedName AS normalizedName, e.name AS name,
                e.type AS type, memoryIds`,
        { nodeIds },
      ),
    ]);

    const relatesToEdges: RelatesToEdge[] = relatesToResult.records.flatMap(
      (r) => {
        const parsed = parseRelatesToEdgeRow(
          rowFromRecord(r, ["source", "target", "reason", "score"] as const),
        );
        return parsed ? [parsed] : [];
      },
    );

    const entities = entityResult.records.flatMap((r) => {
      const parsed = parseEntityRow(
        rowFromRecord(r, [
          "normalizedName",
          "name",
          "type",
          "memoryIds",
        ] as const),
      );
      return parsed ? [parsed] : [];
    });

    const tagEdges = tagEdgesResult.records.map(toTagEdge);

    return {
      nodes,
      relatesToEdges,
      tagEdges,
      entities,
      focusNodeId: resolvedFocusId,
    };
  } finally {
    await Promise.all([
      relatesToSession.close(),
      tagEdgesSession.close(),
      entitySession.close(),
    ]);
  }
}
