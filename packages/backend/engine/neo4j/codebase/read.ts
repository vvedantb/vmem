/**
 * Read-side helpers for the codebase graph. Each function is a single
 * parameterised Cypher query — no string interpolation of user input,
 * scope every query by `(userId, codebaseId)`.
 *
 * `getGraphOverview` returns the lightweight payload the canvas needs
 * (nodes + edges in a flat shape). `getProcessMembers` zooms into one
 * process. `getSymbolContext` powers the right-side detail panel.
 * `searchSymbols` powers the search box.
 */

import { type Driver } from "neo4j-driver";
import { clampNeo4jLimit } from "../intParams";

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
  /** Process member set when kind === "code-process". */
  members?: string[];
  /** Convenience flags. */
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
  tier?: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
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
  /** Filter the result set to one of these kinds. Empty = all kinds. */
  kinds?: OverviewNode["kind"][];
  /** When set, restrict to members of this process. */
  processId?: string | null;
  /** When set, restrict to (start) ∪ blast-radius around this symbol. */
  blastRadiusOf?: string | null;
  blastDirection?: "upstream" | "downstream";
  blastDepth?: number;
}

const CALLS_TIER = "coalesce(r.tier, 'INFERRED')";
const CALLS_CONF = "coalesce(r.confidence, 1.0)";

/**
 * Convex hard-caps any single array in an action return at 8192 entries,
 * so the graph payload has to fit. Big monorepos easily blow past that
 * with CALLS edges alone. We cap both nodes and edges and surface a
 * `truncated` flag so the canvas can tell the user to narrow down.
 */
const MAX_GRAPH_ARRAY = 8192;

/**
 * Cap nodes, dropping the most numerous kind (`code-function`) first.
 * Files / classes / interfaces / processes are structural and far less
 * likely to overflow on their own — keeping them anchors the graph.
 */
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

export async function getOverviewStats(args: ReadArgs): Promise<OverviewStats> {
  const session = args.driver.session();
  try {
    const result = await session.run(
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
    const num = (k: string): number =>
      r.get(k).toNumber?.() ?? Number(r.get(k));
    return {
      fileCount: num("fileCount"),
      functionCount: num("functionCount"),
      classCount: num("classCount"),
      interfaceCount: num("interfaceCount"),
      processCount: num("processCount"),
      callEdgeCount: num("callEdgeCount"),
      importEdgeCount: num("importEdgeCount"),
    };
  } finally {
    await session.close();
  }
}

/** Map Neo4j label sets to our kind enum. Each node has exactly one of these labels. */
function pickKind(labels: string[]): OverviewNode["kind"] | null {
  if (labels.includes("CodeFile")) return "code-file";
  if (labels.includes("Function")) return "code-function";
  if (labels.includes("Class")) return "code-class";
  if (labels.includes("Interface")) return "code-interface";
  if (labels.includes("Process")) return "code-process";
  return null;
}

/**
 * The core graph-overview query. Returns a flat list of nodes and edges
 * scoped to the codebase, optionally filtered. The frontend handles
 * positional layout — we just return the topology.
 */
export async function getGraphOverview(args: FilteredArgs): Promise<{
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  truncated: boolean;
}> {
  const wantedKinds = new Set(args.kinds ?? []);
  const allKinds = wantedKinds.size === 0;

  const session = args.driver.session();
  try {
    // Nodes
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
      const labels: string[] = r.get("labels");
      const kind = pickKind(labels);
      if (!kind) continue;
      if (!allKinds && !wantedKinds.has(kind)) continue;
      const props = r.get("n").properties;
      nodes.push({
        id: props.id,
        kind,
        name:
          kind === "code-process"
            ? (props.name ?? props.id)
            : kind === "code-file"
              ? (props.filename ?? props.path)
              : (props.name ?? props.qualifiedName ?? props.id),
        path: props.path ?? props.filePath ?? "",
        directory: props.directory ?? "",
        isExported: props.isExported ?? undefined,
        isAsync: props.isAsync ?? undefined,
        isTest: props.isTest ?? undefined,
      });
    }

    // Process-member subset
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
        memResult.records[0]?.get("memberIds") ?? [],
      );
      memberIds.add(args.processId);
      nodes = nodes.filter((n) => memberIds.has(n.id));
    }

    // Blast radius subset
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
      const keep = new Set<string>(blastResult.records[0]?.get("keep") ?? []);
      nodes = nodes.filter((n) => keep.has(n.id));
    }

    // Cap nodes before we build the edge filter set so that any edges
    // we drop here also drop their endpoint references.
    const nodeCapResult = capNodes(nodes, MAX_GRAPH_ARRAY);
    nodes = nodeCapResult.nodes;
    let truncated = nodeCapResult.truncated;

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: OverviewEdge[] = [];

    // Edges. We fetch each type separately because Cypher doesn't have a
    // clean "any of these types" form, and the type names are part of
    // the schema not user input — so the static queries are safe.
    //
    // Order matters because we cap at MAX_GRAPH_ARRAY: structural edges
    // (contains / has_method / extends / implements / starts_process /
    // includes) are bounded and informative, so they go first. Imports
    // can grow with file count. CALLS is the explosive one (≈ O(fns²) in
    // the worst case) so it goes last and gets truncated first.
    type EdgeQuery = {
      type: OverviewEdge["type"];
      cypher: string;
      carry: boolean;
    };
    const edgeQueries: EdgeQuery[] = [
      {
        type: "contains",
        cypher: `MATCH (a:CodeFile { userId: $userId, codebaseId: $codebaseId })-[r:CONTAINS]->(b { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
        carry: false,
      },
      {
        type: "has_method",
        cypher: `MATCH (a:Class { userId: $userId, codebaseId: $codebaseId })-[r:HAS_METHOD]->(b:Function { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
        carry: false,
      },
      {
        type: "extends",
        cypher: `MATCH (a:Class { userId: $userId, codebaseId: $codebaseId })-[r:EXTENDS]->(b:Class { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
        carry: true,
      },
      {
        type: "implements",
        cypher: `MATCH (a:Class { userId: $userId, codebaseId: $codebaseId })-[r:IMPLEMENTS]->(b:Interface { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
        carry: true,
      },
      {
        type: "starts_process",
        cypher: `MATCH (a:Function { userId: $userId, codebaseId: $codebaseId })-[r:STARTS_PROCESS]->(b:Process { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
        carry: false,
      },
      {
        type: "includes",
        cypher: `MATCH (a:Process { userId: $userId, codebaseId: $codebaseId })-[r:INCLUDES]->(b:Function { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, null AS confidence, null AS tier`,
        carry: false,
      },
      {
        type: "imports",
        cypher: `MATCH (a:CodeFile { userId: $userId, codebaseId: $codebaseId })-[r:IMPORTS]->(b:CodeFile { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
        carry: true,
      },
      {
        type: "calls",
        cypher: `MATCH (a:Function { userId: $userId, codebaseId: $codebaseId })-[r:CALLS]->(b:Function { userId: $userId, codebaseId: $codebaseId })
                 RETURN a.id AS fromId, b.id AS toId, ${CALLS_CONF} AS confidence, ${CALLS_TIER} AS tier`,
        carry: true,
      },
    ];

    edgeLoop: for (const q of edgeQueries) {
      if (edges.length >= MAX_GRAPH_ARRAY) {
        truncated = true;
        break;
      }
      const er = await session.run(q.cypher, {
        userId: args.userId,
        codebaseId: args.codebaseId,
      });
      for (const rec of er.records) {
        if (edges.length >= MAX_GRAPH_ARRAY) {
          truncated = true;
          break edgeLoop;
        }
        const fromId: string = rec.get("fromId");
        const toId: string = rec.get("toId");
        if (!nodeIds.has(fromId) || !nodeIds.has(toId)) continue;
        const confRaw = rec.get("confidence");
        const tierRaw = rec.get("tier");
        edges.push({
          fromId,
          toId,
          type: q.type,
          confidence: q.carry && confRaw != null ? Number(confRaw) : undefined,
          tier:
            q.carry && tierRaw != null
              ? (tierRaw as OverviewEdge["tier"])
              : undefined,
        });
      }
    }

    return { nodes, edges, truncated };
  } finally {
    await session.close();
  }
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
  const session = args.driver.session();
  try {
    const result = await session.run(
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
    if (result.records.length === 0) return null;
    const r = result.records[0];
    const labels: string[] = r.get("labels");
    const kind = pickKind(labels);
    if (!kind) return null;
    const props = r.get("n").properties;
    const num = (v: unknown): number | undefined =>
      v == null
        ? undefined
        : typeof v === "object" && v !== null && "toNumber" in v
          ? Number((v as { toNumber: () => number }).toNumber())
          : Number(v);
    const filterOut = <T extends { id: string }>(arr: T[]): T[] =>
      arr.filter((x) => x.id != null);
    return {
      id: props.id,
      kind,
      name: props.name ?? props.qualifiedName ?? props.id,
      qualifiedName: props.qualifiedName ?? props.name ?? props.id,
      filePath: props.filePath ?? props.path ?? "",
      startLine: num(props.startLine),
      endLine: num(props.endLine),
      isExported: props.isExported ?? undefined,
      isAsync: props.isAsync ?? undefined,
      isTest: props.isTest ?? undefined,
      callsIn: filterOut(r.get("callsIn")),
      callsOut: filterOut(r.get("callsOut")),
      processes: filterOut(r.get("processes")),
    };
  } finally {
    await session.close();
  }
}

export interface SearchSymbolsResult {
  id: string;
  kind: OverviewNode["kind"];
  name: string;
  qualifiedName: string;
  filePath: string;
}

/**
 * Symbol search via the `code_symbol_search` fulltext index. Falls back
 * to substring-on-name if the fulltext call returns nothing — covers
 * partial-prefix searches the user might expect to "just work".
 */
export async function searchSymbols(
  args: ReadArgs & {
    query: string;
    kind?: SearchSymbolsResult["kind"];
    limit?: number;
  },
): Promise<SearchSymbolsResult[]> {
  const limit = clampNeo4jLimit(args.limit, 25, 100);
  const session = args.driver.session();
  try {
    // Fulltext index supports Lucene syntax — escape special chars and add a
    // wildcard so `valid` matches `validateInput`.
    const escaped = args.query.replace(/[+\-!(){}[\]^"~*?:\\/]/g, "\\$&");
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

    const out: SearchSymbolsResult[] = [];
    for (const rec of ftResult.records) {
      const labels: string[] = rec.get("labels");
      const kind = pickKind(labels);
      if (!kind) continue;
      if (args.kind && kind !== args.kind) continue;
      const p = rec.get("node").properties;
      out.push({
        id: p.id,
        kind,
        name: p.name ?? p.qualifiedName ?? p.id,
        qualifiedName: p.qualifiedName ?? p.name ?? p.id,
        filePath: p.filePath ?? "",
      });
    }
    if (out.length > 0) return out;

    // Fallback substring scan (name, qualifiedName, filePath).
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
    for (const rec of fbResult.records) {
      const labels: string[] = rec.get("labels");
      const kind = pickKind(labels);
      if (!kind) continue;
      if (args.kind && kind !== args.kind) continue;
      const p = rec.get("node").properties;
      out.push({
        id: p.id,
        kind,
        name: p.name ?? p.qualifiedName ?? p.id,
        qualifiedName: p.qualifiedName ?? p.name ?? p.id,
        filePath: p.filePath ?? "",
      });
    }
    return out;
  } finally {
    await session.close();
  }
}
