/**
 * Graph-canvas read paths. `getGraphData` powers the global graph view;
 * `getLocalGraph` powers the focused/expand-around-a-node view; and
 * `getMemoryContent` is the on-demand body fetch used when the graph
 * tooltip or detail panel needs the full text (the graph payload itself
 * deliberately omits `content` to keep wire size manageable at 2k nodes).
 *
 * Both top-level reads parallelise across **separate sessions** — Neo4j
 * driver doesn't allow concurrent `.run()` on the same session, so the
 * Promise.all over per-leg sessions is the parallelism contract.
 */
import { type Driver, type Session } from "neo4j-driver";
import { clampNeo4jLimit } from "../intParams";
import { toMemoryTypeOrUndefined, toNeoInt, toTagEdge } from "./mappers";
import { profileFilter, withSession } from "./shared";
import { type MemoryType, type TagEdge } from "./types";

/** Hard ceiling for one global-graph page; matches MAX_NODES in capGraph. */
export const GLOBAL_GRAPH_MAX_NODES = 2000;
/** Default first page for the progressive global graph. */
export const GLOBAL_GRAPH_DEFAULT_LIMIT = 500;

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
  /**
   * The memory the local graph is centred on. Set by getLocalGraph (which
   * resolves it server-side when no explicit focus is given — newest memory
   * wins); absent on the global graph.
   */
  focusNodeId?: string;
  /**
   * Total active/pinned memories the user has (after profile filter). Set by
   * the global graph so the UI can show an honest "Showing X of Y" instead
   * of silently truncating at the node limit.
   */
  totalMemoryCount?: number;
}

/**
 * Fetches the newest `nodeLimit` active/pinned nodes, their RELATES_TO edges,
 * MENTIONS entities, and the user's total memory count in a single
 * round-trip. The composite index memory_user_status_created lets the
 * planner satisfy both the WHERE and the ORDER BY with one index seek (no
 * Sort op). RELATES_TO is then scoped to the collected node-id list, so the
 * edge scan is O(edges_in_subgraph) rather than O(all_user_edges).
 */
async function fetchGraphNodesAndEdges(
  session: Session,
  userId: string,
  profileId: string | null | undefined,
  nodeLimit: number,
): Promise<{
  nodes: GraphNode[];
  relatesToEdges: RelatesToEdge[];
  entities: GraphData["entities"];
  totalMemoryCount: number;
}> {
  const pf = profileFilter(profileId, "m");
  const result = await session.run(
    `CALL () {
       MATCH (m:Memory {userId: $userId})
       WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] ${pf.clause}
       WITH m ORDER BY m.createdAt DESC LIMIT $nodeLimit
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
       WHERE a.id IN nodeIds AND b.id IN nodeIds
       RETURN collect({source: a.id, target: b.id, reason: r.reason, score: r.score}) AS relatesToEdges
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
     CALL () {
       MATCH (m:Memory {userId: $userId})
       WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] ${pf.clause}
       RETURN count(m) AS totalMemoryCount
     }
     RETURN nodes, relatesToEdges, entities, totalMemoryCount`,
    {
      userId,
      nodeLimit: clampNeo4jLimit(
        nodeLimit,
        GLOBAL_GRAPH_DEFAULT_LIMIT,
        GLOBAL_GRAPH_MAX_NODES,
      ),
      ...pf.params,
    },
  );

  const row = result.records[0];
  const rawNodes = row ? row.get("nodes") : [];
  const rawEdges = row ? row.get("relatesToEdges") : [];
  const rawEntities = row ? row.get("entities") : [];
  const totalMemoryCount = row ? toNeoInt(row.get("totalMemoryCount")) : 0;

  const nodes: GraphNode[] = (Array.isArray(rawNodes) ? rawNodes : []).map(
    (n) => ({
      id: String(n.id),
      title: String(n.title),
      tags: Array.isArray(n.tags) ? n.tags.filter(Boolean).map(String) : [],
      createdAt: String(n.createdAt),
      source: n.source !== null ? String(n.source) : undefined,
      sourceType: n.sourceType !== null ? String(n.sourceType) : null,
      type: toMemoryTypeOrUndefined(n.type),
    }),
  );

  const relatesToEdges: RelatesToEdge[] = (
    Array.isArray(rawEdges) ? rawEdges : []
  ).map((e) => ({
    source: String(e.source),
    target: String(e.target),
    reason: String(e.reason ?? ""),
  }));

  const entities: GraphData["entities"] = (
    Array.isArray(rawEntities) ? rawEntities : []
  ).map((e) => ({
    normalizedName: String(e.normalizedName),
    name: String(e.name),
    type: String(e.type),
    memoryIds: Array.isArray(e.memoryIds) ? e.memoryIds.map(String) : [],
  }));

  return { nodes, relatesToEdges, entities, totalMemoryCount };
}

/**
 * Tag-shared edges. Seed MATCH gathers each tag's memory list once, applies
 * the [2, 500] cardinality gate, then unwinds the per-tag list against
 * itself to generate pairs. Caps the cartesian at 500×500 per tag, and
 * applies profile/status filtering once in the seed (not per-pair).
 */
async function fetchTagSharedEdges(
  session: Session,
  userId: string,
  profileId: string | null | undefined,
): Promise<TagEdge[]> {
  const pf = profileFilter(profileId, "m");
  const result = await session.run(
    `MATCH (m:Memory {userId: $userId})-[:TAGGED_WITH]->(t:Tag)
     WHERE coalesce(m.status, 'active') IN ['active', 'pinned'] ${pf.clause}
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
): Promise<GraphData> {
  // Two parallel sessions — driver doesn't allow concurrent .run() on the
  // same session. The first leg returns nodes + RELATES_TO + entities in
  // one round-trip; the second leg computes tag-shared edges independently.
  // `content` is intentionally NOT returned: the graph canvas only renders
  // it inline in the tooltip/detail panel, both of which fetch on demand
  // via getMemoryContent. Dropping it cuts payload roughly in half at 2k.
  const nodesEdgesSession = driver.session();
  const tagEdgesSession = driver.session();
  try {
    const [nodesAndEdges, tagEdges] = await Promise.all([
      fetchGraphNodesAndEdges(nodesEdgesSession, userId, profileId, nodeLimit),
      fetchTagSharedEdges(tagEdgesSession, userId, profileId),
    ]);
    return { ...nodesAndEdges, tagEdges };
  } finally {
    await Promise.all([nodesEdgesSession.close(), tagEdgesSession.close()]);
  }
}

/**
 * Fetches the body text of a single memory on-demand. The graph payload
 * deliberately omits `content`; this is what hover-tooltip and the detail
 * side panel call. Scoped by userId so a user can never read another
 * user's memory content.
 */
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
    const value = first.get("content");
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
  // Mirrors getGraphData: content is NOT part of the graph payload. The
  // frontend fetches it on demand via getMemoryContent when the user hovers
  // or opens the detail panel.
  const nodesSession = driver.session();
  let nodeIds: string[];
  let nodes: GraphNode[];
  let resolvedFocusId: string | undefined;

  const pfFocus = profileFilter(profileId, "focus");
  // QPP inline filter on the traversal node. Keeps the suppressed/wrong-
  // user nodes from expanding at all, rather than expanding and discarding.
  const pfB = profileFilter(profileId, "b");

  // QPP quantifiers must be literals (Cypher rejects parameters there), so
  // the hop count is interpolated after clamping to a safe range.
  const hops = Math.min(3, Math.max(1, Math.trunc(depth)));

  // No explicit focus → centre on the newest active memory. This powers the
  // default graph entry (local neighbourhood instead of the full graph).
  const focusMatch =
    focusId !== null
      ? `MATCH (focus:Memory {id: $focusId, userId: $userId})
         WHERE coalesce(focus.status, 'active') IN ['active', 'pinned'] ${pfFocus.clause}`
      : `MATCH (focus:Memory {userId: $userId})
         WHERE coalesce(focus.status, 'active') IN ['active', 'pinned'] ${pfFocus.clause}
         WITH focus ORDER BY focus.createdAt DESC LIMIT 1`;

  try {
    // Quantified Path Pattern replaces the old [:RELATES_TO*1..2] form.
    // QPP filters each hop inline, so the planner stops expansion early at
    // suppressed or wrong-user nodes instead of traversing then discarding.
    const nodesResult = await nodesSession.run(
      `${focusMatch}
       OPTIONAL MATCH (focus)
         ((a:Memory WHERE coalesce(a.status, 'active') IN ['active', 'pinned'])
          -[:RELATES_TO]-
          (b:Memory WHERE coalesce(b.status, 'active') IN ['active', 'pinned']
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
      ? String(firstRecord.get("focusId"))
      : undefined;

    nodes = nodesResult.records.map((r) => ({
      id: String(r.get("id")),
      title: String(r.get("title")),
      tags: Array.isArray(r.get("tags"))
        ? r.get("tags").filter(Boolean).map(String)
        : [],
      createdAt: String(r.get("createdAt")),
      source: r.get("source") !== null ? String(r.get("source")) : undefined,
      sourceType:
        r.get("sourceType") !== null ? String(r.get("sourceType")) : null,
      type: toMemoryTypeOrUndefined(r.get("type")),
    }));
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

  // Edges scoped to the local neighbourhood: RELATES_TO, tag-shared, and
  // entity data are computed in Cypher in parallel across separate sessions.
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
        // No popular-tag pre-filter needed — the node set is already bounded
        // by the focus neighbourhood (LIMIT 500 upstream), so the pair
        // cartesian is always small.
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

    const relatesToEdges: RelatesToEdge[] = relatesToResult.records.map((r) => {
      const rawScore = r.get("score");
      return {
        source: String(r.get("source")),
        target: String(r.get("target")),
        reason: String(r.get("reason") ?? ""),
        score:
          rawScore !== null && rawScore !== undefined
            ? Number(rawScore)
            : undefined,
      };
    });

    const entities = entityResult.records.map((r) => ({
      normalizedName: String(r.get("normalizedName")),
      name: String(r.get("name")),
      type: String(r.get("type")),
      memoryIds: Array.isArray(r.get("memoryIds"))
        ? r.get("memoryIds").map(String)
        : [],
    }));

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
