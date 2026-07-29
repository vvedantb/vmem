import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { clampNeo4jLimit } from "../intParams";
import { neo4jGet, parseNeo4jInt } from "../record";
import { toMemoryTypeOrUndefined, toTagEdge } from "./mappers";
import { memoryScopeFilter } from "./scope";
import type { MemoryReadScope } from "./scope";
import { visibleStatusClause } from "./shared";
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

export function parseRelatesToEdgeRow(raw: unknown): RelatesToEdge | null {
  const parsed = relatesToEdgeRowSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseEntityRow(raw: unknown): GraphData["entities"][number] | null {
  const parsed = entityRowSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function mergeGlobalRelatesToEdges(
  rawOutEdges: unknown,
  rawInEdges: unknown,
): RelatesToEdge[] {
  const relatesToEdges: RelatesToEdge[] = [];
  const seenPairs = new Set<string>();
  for (const raw of [rawOutEdges, rawInEdges]) {
    for (const e of Array.isArray(raw) ? raw : []) {
      const parsed = parseRelatesToEdgeRow(e);
      if (!parsed) continue;
      const key = `${parsed.source}|${parsed.target}`;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      // global graph edges omit score, local edges include it for ranking
      relatesToEdges.push({
        source: parsed.source,
        target: parsed.target,
        reason: parsed.reason,
      });
    }
  }
  return relatesToEdges;
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
  driver: Driver,
  scope: MemoryReadScope,
  nodeLimit: number,
  cursor: GraphCursor | null,
): Promise<{
  nodes: GraphNode[];
  relatesToEdges: RelatesToEdge[];
  entities: GraphData["entities"];
  totalMemoryCount: number | undefined;
  nextCursor: GraphCursor | undefined;
}> {
  const sf = memoryScopeFilter(scope, "m");
  const sfA = memoryScopeFilter(scope, "a");
  const sfB = memoryScopeFilter(scope, "b");
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
         MATCH (m:Memory)
         WHERE ${sf.clause} AND ${visibleStatusClause("m")}
         RETURN count(m) AS totalMemoryCount
       }`;

  const result = await driver.executeQuery(
    `CALL () {
       MATCH (m:Memory)
       WHERE ${sf.clause} AND ${visibleStatusClause("m")}
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
       WHERE a.id IN nodeIds AND ${sfB.clause}
       RETURN collect({source: a.id, target: b.id, reason: r.reason, score: r.score}) AS outEdges
     }
     CALL (nodeIds) {
       MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
       WHERE b.id IN nodeIds AND ${sfA.clause}
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
      nodeLimit: clampNeo4jLimit(
        limit,
        GLOBAL_GRAPH_DEFAULT_LIMIT,
        GLOBAL_GRAPH_MAX_NODES,
      ),
      ...(cursor
        ? { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id }
        : {}),
      ...sf.params,
      ...sfA.params,
      ...sfB.params,
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

  const relatesToEdges = mergeGlobalRelatesToEdges(rawOutEdges, rawInEdges);

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
  driver: Driver,
  scope: MemoryReadScope,
): Promise<TagEdge[]> {
  const sf = memoryScopeFilter(scope, "m");
  const result = await driver.executeQuery(
    `MATCH (m:Memory)-[:TAGGED_WITH]->(t:Tag)
     WHERE ${sf.clause} AND ${visibleStatusClause("m")}
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
    { ...sf.params },
  );
  return result.records.map(toTagEdge);
}

// AI-generated (Claude), prompt: "fetch paginated memory graph nodes relates edges and tag shared edges with profile filters"
// Modified by me: node limit defaults and cursor behavior for large graphs
export async function getGraphData(
  driver: Driver,
  scope: MemoryReadScope,
  nodeLimit: number = GLOBAL_GRAPH_MAX_NODES,
  cursor: GraphCursor | null = null,
): Promise<GraphData> {
  const [nodesAndEdges, tagEdges] = await Promise.all([
    fetchGraphNodesAndEdges(driver, scope, nodeLimit, cursor),
    cursor === null
      ? fetchTagSharedEdges(driver, scope)
      : Promise.resolve<TagEdge[]>([]),
  ]);
  return { ...nodesAndEdges, tagEdges };
}

export async function getMemoryContent(
  driver: Driver,
  scope: MemoryReadScope,
  memoryId: string,
): Promise<string> {
  const sf = memoryScopeFilter(scope, "m");
  const result = await driver.executeQuery(
    `MATCH (m:Memory {id: $memoryId})
     WHERE ${sf.clause}
     RETURN m.content AS content`,
    { memoryId, ...sf.params },
  );
  const first = result.records[0];
  if (!first) return "";
  const value = neo4jGet(first, "content");
  return typeof value === "string" ? value : "";
}

export async function getLocalGraph(
  driver: Driver,
  scope: MemoryReadScope,
  focusId: string | null,
  depth: number = 2,
): Promise<GraphData> {
  const sfFocus = memoryScopeFilter(scope, "focus");
  const sfB = memoryScopeFilter(scope, "b");
  const hops = Math.min(3, Math.max(1, Math.trunc(depth)));

  const focusMatch =
    focusId !== null
      ? `MATCH (focus:Memory {id: $focusId})
         WHERE ${sfFocus.clause} AND ${visibleStatusClause("focus")}`
      : `MATCH (focus:Memory)
         WHERE ${sfFocus.clause} AND ${visibleStatusClause("focus")}
         WITH focus ORDER BY focus.createdAt DESC LIMIT 1`;

  const nodesResult = await driver.executeQuery(
    `${focusMatch}
     OPTIONAL MATCH (focus)
       ((a:Memory WHERE ${visibleStatusClause("a")})
        -[:RELATES_TO]-
        (b:Memory WHERE ${visibleStatusClause("b")}
           AND ${sfB.clause})
       ){1,${hops}}
       (neighbor:Memory)
     WITH focus, collect(DISTINCT neighbor) AS neighbors
     WITH focus.id AS focusId, [focus] + neighbors AS allNodes
     UNWIND allNodes AS m
     WITH DISTINCT m, focusId LIMIT 500
     OPTIONAL MATCH (m)-[:TAGGED_WITH]->(t:Tag)
     WITH m, focusId, collect(t.name) AS tags
     RETURN {id: m.id, title: m.title, tags: tags,
             createdAt: m.createdAt, source: m.source,
             type: m.type, sourceType: m.sourceType} AS node,
            focusId`,
    {
      ...(focusId !== null ? { focusId } : {}),
      ...sfFocus.params,
      ...sfB.params,
    },
  );

  const firstRecord = nodesResult.records[0];
  const resolvedFocusId = firstRecord
    ? String(neo4jGet(firstRecord, "focusId"))
    : undefined;

  const nodes = nodesResult.records.flatMap((r) => {
    const node = parseGraphNodeRow(neo4jGet(r, "node"));
    return node === null ? [] : [node];
  });
  const nodeIds = nodes.map((n) => n.id);

  if (nodeIds.length === 0) {
    return {
      nodes: [],
      relatesToEdges: [],
      tagEdges: [],
      entities: [],
      focusNodeId: resolvedFocusId,
    };
  }

  const [relatesToResult, tagEdgesResult, entityResult] = await Promise.all([
    driver.executeQuery(
      `MATCH (a:Memory)-[r:RELATES_TO]->(b:Memory)
       WHERE a.id IN $nodeIds AND b.id IN $nodeIds
       RETURN {source: a.id, target: b.id, reason: r.reason,
               score: r.score} AS edge`,
      { nodeIds },
    ),
    driver.executeQuery(
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
    driver.executeQuery(
      `MATCH (m:Memory)-[:MENTIONS]->(e:Entity)
       WHERE m.id IN $nodeIds
       WITH e, collect(m.id) AS memoryIds
       RETURN {normalizedName: e.normalizedName, name: e.name,
               type: e.type, memoryIds: memoryIds} AS entity`,
      { nodeIds },
    ),
  ]);

  const relatesToEdges: RelatesToEdge[] = relatesToResult.records.flatMap(
    (r) => {
      const parsed = parseRelatesToEdgeRow(neo4jGet(r, "edge"));
      return parsed ? [parsed] : [];
    },
  );

  const entities = entityResult.records.flatMap((r) => {
    const parsed = parseEntityRow(neo4jGet(r, "entity"));
    return parsed ? [parsed] : [];
  });

  return {
    nodes,
    relatesToEdges,
    tagEdges: tagEdgesResult.records.map(toTagEdge),
    entities,
    focusNodeId: resolvedFocusId,
  };
}
