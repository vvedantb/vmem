import type { Driver, Session } from "neo4j-driver";
import { clampNeo4jLimit } from "../intParams";
import { escapeLuceneQuery } from "../luceneQuery";
import { withSession } from "../session";
import type { ConfidenceTier } from "./types";
import {
  parseOverviewEdge,
  parseOverviewNodeRecord,
  parseOverviewStats,
  parseSearchSymbolRecord,
  parseStringArrayField,
  parseSymbolContextRecord,
} from "./mappers";

export interface OverviewNode {
  id: string;
  kind:
    | "code-file"
    | "code-function"
    | "code-class"
    | "code-interface"
    | "code-process";
  name: string;
  path: string;
  directory: string;
  members?: string[];
  isExported?: boolean;
  isAsync?: boolean;
  isTest?: boolean;
}

export interface OverviewEdge {
  fromId: string;
  toId: string;
  type:
    | "imports"
    | "calls"
    | "contains"
    | "has_method"
    | "extends"
    | "implements"
    | "starts_process"
    | "includes";
  confidence?: number;
  tier?: ConfidenceTier;
}

export interface OverviewStats {
  fileCount: number;
  functionCount: number;
  classCount: number;
  interfaceCount: number;
  processCount: number;
  callEdgeCount: number;
  importEdgeCount: number;
}

interface ReadArgs {
  driver: Driver;
  userId: string;
  codebaseId: string;
}

interface FilteredArgs extends ReadArgs {
  kinds?: OverviewNode["kind"][];
  processId?: string | null;
  blastRadiusOf?: string | null;
  blastDirection?: "upstream" | "downstream";
  blastDepth?: number;
}

const CALLS_TIER = "coalesce(r.tier, 'INFERRED')";
const CALLS_CONF = "coalesce(r.confidence, 1.0)";
const MAX_GRAPH_ARRAY = 8192;

const SCOPED_NODE = "{ userId: $userId, codebaseId: $codebaseId }";

type EdgeQuery = {
  type: OverviewEdge["type"];
  cypher: string;
};

const STRUCTURAL_EDGE_QUERIES: EdgeQuery[] = [
  {
    type: "contains",
    cypher: `MATCH (a:CodeFile ${SCOPED_NODE})-[r:CONTAINS]->(b ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
  },
  {
    type: "has_method",
    cypher: `MATCH (a:Class ${SCOPED_NODE})-[r:HAS_METHOD]->(b:Function ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
  },
  {
    type: "starts_process",
    cypher: `MATCH (a:Function ${SCOPED_NODE})-[r:STARTS_PROCESS]->(b:Process ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
  },
  {
    type: "includes",
    cypher: `MATCH (a:Process ${SCOPED_NODE})-[r:INCLUDES]->(b:Function ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
  },
];

const CONFIDENT_EDGE_QUERIES: EdgeQuery[] = [
  {
    type: "extends",
    cypher: `MATCH (a:Class ${SCOPED_NODE})-[r:EXTENDS]->(b:Class ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
  },
  {
    type: "implements",
    cypher: `MATCH (a:Class ${SCOPED_NODE})-[r:IMPLEMENTS]->(b:Interface ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
  },
  {
    type: "imports",
    cypher: `MATCH (a:CodeFile ${SCOPED_NODE})-[r:IMPORTS]->(b:CodeFile ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
  },
  {
    type: "calls",
    cypher: `MATCH (a:Function ${SCOPED_NODE})-[r:CALLS]->(b:Function ${SCOPED_NODE})
             RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
  },
];

function capNodes(
  nodes: OverviewNode[],
  cap: number,
): { nodes: OverviewNode[]; truncated: boolean } {
  if (nodes.length <= cap) return { nodes, truncated: false };
  const structural = nodes.filter((n) => n.kind !== "code-function");
  const functions = nodes.filter((n) => n.kind === "code-function");
  if (structural.length >= cap) {
    return { nodes: structural.slice(0, cap), truncated: true };
  }
  return {
    nodes: [...structural, ...functions.slice(0, cap - structural.length)],
    truncated: true,
  };
}

async function loadEdges(
  session: Session,
  userId: string,
  codebaseId: string,
  nodeIds: Set<string>,
  queries: EdgeQuery[],
): Promise<{ edges: OverviewEdge[]; truncated: boolean }> {
  const edges: OverviewEdge[] = [];
  let truncated = false;
  const params = { userId, codebaseId };

  edgeLoop: for (const q of queries) {
    if (edges.length >= MAX_GRAPH_ARRAY) {
      truncated = true;
      break;
    }
    const er = await session.run(q.cypher, params);
    for (const rec of er.records) {
      if (edges.length >= MAX_GRAPH_ARRAY) {
        truncated = true;
        break edgeLoop;
      }
      const edge = parseOverviewEdge(rec, q.type);
      if (!nodeIds.has(edge.fromId) || !nodeIds.has(edge.toId)) continue;
      edges.push(edge);
    }
  }

  return { edges, truncated };
}

export async function getOverviewStats(args: ReadArgs): Promise<OverviewStats> {
  const result = await args.driver.executeQuery(
    `
    MATCH (f:CodeFile { userId: $userId, codebaseId: $codebaseId })
    WITH count(f) AS fileCount
    OPTIONAL MATCH (fn:Function { userId: $userId, codebaseId: $codebaseId })
    WITH fileCount, count(fn) AS functionCount
    OPTIONAL MATCH (c:Class { userId: $userId, codebaseId: $codebaseId })
    WITH fileCount, functionCount, count(c) AS classCount
    OPTIONAL MATCH (i:Interface { userId: $userId, codebaseId: $codebaseId })
    WITH fileCount, functionCount, classCount, count(i) AS interfaceCount
    OPTIONAL MATCH (p:Process { userId: $userId, codebaseId: $codebaseId })
    WITH fileCount, functionCount, classCount, interfaceCount, count(p) AS processCount
    OPTIONAL MATCH (:Function { userId: $userId, codebaseId: $codebaseId })-[r:CALLS]->(:Function { userId: $userId, codebaseId: $codebaseId })
    WITH fileCount, functionCount, classCount, interfaceCount, processCount, count(r) AS callEdgeCount
    OPTIONAL MATCH (:CodeFile { userId: $userId, codebaseId: $codebaseId })-[ir:IMPORTS]->(:CodeFile { userId: $userId, codebaseId: $codebaseId })
    RETURN fileCount, functionCount, classCount, interfaceCount, processCount, callEdgeCount, count(ir) AS importEdgeCount
    `,
    { userId: args.userId, codebaseId: args.codebaseId },
  );
  const r = result.records[0];
  if (!r) {
    return {
      fileCount: 0,
      functionCount: 0,
      classCount: 0,
      interfaceCount: 0,
      processCount: 0,
      callEdgeCount: 0,
      importEdgeCount: 0,
    };
  }
  return parseOverviewStats(r);
}

export async function getGraphOverview(args: FilteredArgs): Promise<{
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  truncated: boolean;
}> {
  const wantedKinds = new Set(args.kinds ?? []);
  const allKinds = wantedKinds.size === 0;

  return withSession(args.driver, async (session) => {
    const nodesResult = await session.run(
      `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
      RETURN labels(n) AS labels, n
      `,
      { userId: args.userId, codebaseId: args.codebaseId },
    );

    let nodes: OverviewNode[] = [];
    for (const r of nodesResult.records) {
      const node = parseOverviewNodeRecord(r);
      if (!node) continue;
      if (!allKinds && !wantedKinds.has(node.kind)) continue;
      nodes.push(node);
    }

    if (args.processId) {
      const memResult = await session.run(
        `
        MATCH (p:Process { id: $processId, userId: $userId, codebaseId: $codebaseId })-[:INCLUDES]->(m:Function)
        RETURN collect(m.id) AS memberIds, p.id AS processId
        `,
        {
          processId: args.processId,
          userId: args.userId,
          codebaseId: args.codebaseId,
        },
      );
      const memberIds = new Set<string>(
        parseStringArrayField(memResult.records[0], "memberIds"),
      );
      memberIds.add(args.processId);
      nodes = nodes.filter((n) => memberIds.has(n.id));
    }

    if (args.blastRadiusOf) {
      const depth = Math.max(1, Math.min(8, Math.trunc(args.blastDepth ?? 5)));
      const arrow =
        args.blastDirection === "downstream" ? "-[:CALLS*1.." : "<-[:CALLS*1..";
      const tail = args.blastDirection === "downstream" ? "]->" : "]-";
      const blastResult = await session.run(
        `
        MATCH (start { id: $sym, userId: $userId, codebaseId: $codebaseId })
        OPTIONAL MATCH path = (start)${arrow}${depth}${tail}(other:Function)
        WITH start, collect(DISTINCT other.id) AS others
        RETURN [start.id] + others AS keep
        `,
        {
          sym: args.blastRadiusOf,
          userId: args.userId,
          codebaseId: args.codebaseId,
        },
      );
      const keep = new Set<string>(
        parseStringArrayField(blastResult.records[0], "keep"),
      );
      nodes = nodes.filter((n) => keep.has(n.id));
    }

    const nodeCapResult = capNodes(nodes, MAX_GRAPH_ARRAY);
    nodes = nodeCapResult.nodes;
    let truncated = nodeCapResult.truncated;

    const nodeIds = new Set(nodes.map((n) => n.id));
    const structural = await loadEdges(
      session,
      args.userId,
      args.codebaseId,
      nodeIds,
      STRUCTURAL_EDGE_QUERIES,
    );
    const confident = await loadEdges(
      session,
      args.userId,
      args.codebaseId,
      nodeIds,
      CONFIDENT_EDGE_QUERIES,
    );
    if (structural.truncated || confident.truncated) truncated = true;

    return {
      nodes,
      edges: [...structural.edges, ...confident.edges],
      truncated,
    };
  });
}

export interface SymbolContext {
  id: string;
  kind: OverviewNode["kind"];
  name: string;
  qualifiedName: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  isExported?: boolean;
  isAsync?: boolean;
  isTest?: boolean;
  callsIn: { id: string; name: string; filePath: string }[];
  callsOut: { id: string; name: string; filePath: string }[];
  processes: { id: string; name: string }[];
}

export async function getSymbolContext(
  args: ReadArgs & { symbolId: string },
): Promise<SymbolContext | null> {
  const result = await args.driver.executeQuery(
    `
    MATCH (n { id: $symbolId, userId: $userId, codebaseId: $codebaseId })
    WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
    OPTIONAL MATCH (caller:Function)-[:CALLS]->(n)
    WITH n, collect(DISTINCT { id: caller.id, name: caller.name, filePath: caller.filePath }) AS callsIn
    OPTIONAL MATCH (n)-[:CALLS]->(callee:Function)
    WITH n, callsIn, collect(DISTINCT { id: callee.id, name: callee.name, filePath: callee.filePath }) AS callsOut
    OPTIONAL MATCH (proc:Process)-[:INCLUDES]->(n)
    WITH n, callsIn, callsOut, collect(DISTINCT { id: proc.id, name: proc.name }) AS processes
    RETURN labels(n) AS labels, n, callsIn, callsOut, processes
    `,
    {
      userId: args.userId,
      codebaseId: args.codebaseId,
      symbolId: args.symbolId,
    },
  );
  const record = result.records.at(0);
  if (!record) return null;
  return parseSymbolContextRecord(record);
}

export interface SearchSymbolsResult {
  id: string;
  kind: OverviewNode["kind"];
  name: string;
  qualifiedName: string;
  filePath: string;
}

export async function searchSymbols(
  args: ReadArgs & {
    query: string;
    kind?: SearchSymbolsResult["kind"];
    limit?: number;
  },
): Promise<SearchSymbolsResult[]> {
  const limit = clampNeo4jLimit(args.limit, 25, 100);

  return withSession(args.driver, async (session) => {
    const escaped = escapeLuceneQuery(args.query);
    const ftQuery = `${escaped}* OR ${escaped}~`;
    const ftResult = await session.run(
      `
      CALL db.index.fulltext.queryNodes('code_symbol_search', $q) YIELD node, score
      WHERE node.userId = $userId AND node.codebaseId = $codebaseId
      RETURN labels(node) AS labels, node
      ORDER BY score DESC
      LIMIT $limit
      `,
      {
        q: ftQuery,
        userId: args.userId,
        codebaseId: args.codebaseId,
        limit,
      },
    );

    const collectRows = (
      records: typeof ftResult.records,
      nodeKey: "node" | "n",
    ): SearchSymbolsResult[] => {
      const rows: SearchSymbolsResult[] = [];
      for (const rec of records) {
        const row = parseSearchSymbolRecord(rec, nodeKey);
        if (!row) continue;
        if (args.kind && row.kind !== args.kind) continue;
        rows.push(row);
      }
      return rows;
    };

    const primary = collectRows(ftResult.records, "node");
    if (primary.length > 0) return primary;

    const fbResult = await session.run(
      `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:Function OR n:Class OR n:Interface)
        AND (
          toLower(coalesce(n.name, '')) CONTAINS toLower($q)
          OR toLower(coalesce(n.qualifiedName, '')) CONTAINS toLower($q)
          OR toLower(coalesce(n.filePath, '')) CONTAINS toLower($q)
        )
      RETURN labels(n) AS labels, n
      LIMIT $limit
      `,
      {
        q: args.query,
        userId: args.userId,
        codebaseId: args.codebaseId,
        limit,
      },
    );
    return collectRows(fbResult.records, "n");
  });
}
