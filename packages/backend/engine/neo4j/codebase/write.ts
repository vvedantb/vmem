/**
 * Neo4j bulk writer. Chunks at 500 to stay well under Neo4j's 4 MB
 * transaction cap. Order matters:
 *
 *   1. deleteStale — remove nodes/edges no longer in the parse result
 *   2. upsert files
 *   3. upsert functions / classes / interfaces
 *   4. upsert IMPORTS / CALLS / HAS_METHOD / EXTENDS / IMPLEMENTS / CONTAINS
 *   5. upsert processes + STARTS_PROCESS / INCLUDES
 *
 * Every call uses `UNWIND $rows MERGE (n:Label { id: row.id }) SET n += row.props`
 * so re-syncs are idempotent (qualified-name IDs) and the Convex action
 * stays under the 10-min timeout budget.
 */

import type { Driver } from "neo4j-driver";
import {
  type ParseStats,
  type ProcessNode,
  type RelationEdge,
  type SymbolNode,
  type FileNode,
  type FunctionNode,
  type ClassNode,
  type InterfaceNode,
  PARSER_VERSION,
} from "./types";

const CHUNK_SIZE = 500;

type Neo4jPropValue = string | number | boolean | null;
type UpsertRow = { id: string; props: Record<string, Neo4jPropValue> };

type CodeNodeLabel =
  | "CodeFile"
  | "Function"
  | "Class"
  | "Interface"
  | "Process";

interface WriteArgs {
  driver: Driver;
  userId: string;
  codebaseId: string;
  symbols: SymbolNode[];
  structuralRelations: RelationEdge[];
  calls: RelationEdge[];
  processes: ProcessNode[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Open a session, run one query, and always close it. */
async function runQuery(
  driver: Driver,
  query: string,
  params: Record<string, unknown>,
): Promise<void> {
  const session = driver.session();
  try {
    await session.run(query, params);
  } finally {
    await session.close();
  }
}

/**
 * Delete any code-graph node scoped to (userId, codebaseId) whose id
 * isn't in the new keep-set. DETACH DELETE drops attached edges too.
 */
async function deleteStale(
  driver: Driver,
  userId: string,
  codebaseId: string,
  keepIds: string[],
): Promise<void> {
  await runQuery(
    driver,
    `
    MATCH (n { userId: $userId, codebaseId: $codebaseId })
    WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
      AND NOT n.id IN $keepIds
    DETACH DELETE n
    `,
    { userId, codebaseId, keepIds },
  );
}

async function upsertNodes(
  driver: Driver,
  label: CodeNodeLabel,
  rows: UpsertRow[],
  options?: { touchUpdatedAt?: boolean },
): Promise<void> {
  if (rows.length === 0) return;
  const touchUpdatedAt = options?.touchUpdatedAt ?? true;
  const now = Date.now();
  const updatedAtClause = touchUpdatedAt ? "SET n.updatedAt = $now" : "";
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    await runQuery(
      driver,
      `
      UNWIND $rows AS row
      MERGE (n:${label} { id: row.id })
      SET n += row.props
      ${updatedAtClause}
      SET n.createdAt = coalesce(n.createdAt, $now)
      `,
      { rows: batch, now },
    );
  }
}

/** Wrap a node id + userId/codebaseId scoping into the common upsert-row shape. */
function makeRow(
  id: string,
  userId: string,
  codebaseId: string,
  fields: Record<string, Neo4jPropValue>,
): UpsertRow {
  return { id, props: { userId, codebaseId, ...fields } };
}

function fileRow(f: FileNode, userId: string, codebaseId: string): UpsertRow {
  return makeRow(f.id, userId, codebaseId, {
    path: f.path,
    directory: f.directory,
    filename: f.filename,
    extension: f.extension,
    sizeBytes: f.sizeBytes,
    contentHash: f.contentHash,
  });
}

function functionRow(
  f: FunctionNode,
  userId: string,
  codebaseId: string,
): UpsertRow {
  return makeRow(f.id, userId, codebaseId, {
    filePath: f.filePath,
    name: f.name,
    qualifiedName: f.qualifiedName,
    parentClass: f.parentClass ?? null,
    startLine: f.startLine,
    endLine: f.endLine,
    isExported: f.isExported,
    isAsync: f.isAsync,
    isTest: f.isTest,
    paramCount: f.paramCount,
  });
}

function classRow(c: ClassNode, userId: string, codebaseId: string): UpsertRow {
  return makeRow(c.id, userId, codebaseId, {
    filePath: c.filePath,
    name: c.name,
    qualifiedName: c.qualifiedName,
    startLine: c.startLine,
    endLine: c.endLine,
    isExported: c.isExported,
    isAbstract: c.isAbstract,
    extendsName: c.extendsName ?? null,
  });
}

function interfaceRow(
  i: InterfaceNode,
  userId: string,
  codebaseId: string,
): UpsertRow {
  return makeRow(i.id, userId, codebaseId, {
    filePath: i.filePath,
    name: i.name,
    qualifiedName: i.qualifiedName,
    startLine: i.startLine,
    endLine: i.endLine,
    isExported: i.isExported,
  });
}

function processRow(
  p: ProcessNode,
  userId: string,
  codebaseId: string,
): UpsertRow {
  return makeRow(p.id, userId, codebaseId, {
    name: p.name,
    entryPointId: p.entryPointId,
    entryKind: p.entryKind,
    nodeCount: p.members.length,
  });
}

/**
 * Upsert a batch of edges of a single type. Endpoint labels are
 * variable, so we use generic `(a {id})-[r:TYPE]->(b {id})`.
 */
async function upsertEdges(
  driver: Driver,
  type: string,
  edges: RelationEdge[],
): Promise<void> {
  if (edges.length === 0) return;
  for (const batch of chunk(edges, CHUNK_SIZE)) {
    await runQuery(
      driver,
      `
      UNWIND $rows AS row
      MATCH (a { id: row.fromId })
      MATCH (b { id: row.toId })
      MERGE (a)-[r:${type}]->(b)
      SET r += row.props
      `,
      {
        rows: batch.map((e) => ({
          fromId: e.fromId,
          toId: e.toId,
          props: edgeProps(e),
        })),
      },
    );
  }
}

function edgeProps(e: RelationEdge): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.confidence !== undefined) out.confidence = e.confidence;
  if (e.tier !== undefined) out.tier = e.tier;
  if (e.importPath !== undefined) out.importPath = e.importPath;
  if (e.callSiteLine !== undefined) out.callSiteLine = e.callSiteLine;
  return out;
}

/** MERGE labeled endpoints with a fixed relationship type (no edge props). */
async function upsertLabeledEdges(
  driver: Driver,
  edgeType: string,
  fromLabel: string,
  toLabel: string,
  rows: Array<{ fromId: string; toId: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    await runQuery(
      driver,
      `
      UNWIND $rows AS row
      MATCH (a:${fromLabel} { id: row.fromId })
      MATCH (b:${toLabel} { id: row.toId })
      MERGE (a)-[:${edgeType}]->(b)
      `,
      { rows: batch },
    );
  }
}

async function upsertProcesses(
  driver: Driver,
  userId: string,
  codebaseId: string,
  processes: ProcessNode[],
): Promise<void> {
  if (processes.length === 0) return;

  await upsertNodes(
    driver,
    "Process",
    processes.map((p) => processRow(p, userId, codebaseId)),
    { touchUpdatedAt: false },
  );

  await upsertLabeledEdges(
    driver,
    "STARTS_PROCESS",
    "Function",
    "Process",
    processes.map((p) => ({ fromId: p.entryPointId, toId: p.id })),
  );

  const includes = processes.flatMap((p) =>
    p.members.map((memberId) => ({ fromId: p.id, toId: memberId })),
  );
  await upsertLabeledEdges(driver, "INCLUDES", "Process", "Function", includes);
}

/** Public entry point. Returns ParseStats so the action can patch the codebases row. */
export async function writeParseResult(args: WriteArgs): Promise<ParseStats> {
  const {
    driver,
    userId,
    codebaseId,
    symbols,
    structuralRelations,
    calls,
    processes,
  } = args;

  const files = symbols.filter((s): s is FileNode => s.kind === "file");
  const fns = symbols.filter((s): s is FunctionNode => s.kind === "function");
  const classes = symbols.filter((s): s is ClassNode => s.kind === "class");
  const interfaces = symbols.filter(
    (s): s is InterfaceNode => s.kind === "interface",
  );

  const keepIds = [
    ...files.map((f) => f.id),
    ...fns.map((f) => f.id),
    ...classes.map((c) => c.id),
    ...interfaces.map((i) => i.id),
    ...processes.map((p) => p.id),
  ];

  await deleteStale(driver, userId, codebaseId, keepIds);
  await upsertNodes(
    driver,
    "CodeFile",
    files.map((f) => fileRow(f, userId, codebaseId)),
  );
  await upsertNodes(
    driver,
    "Function",
    fns.map((f) => functionRow(f, userId, codebaseId)),
  );
  await upsertNodes(
    driver,
    "Class",
    classes.map((c) => classRow(c, userId, codebaseId)),
  );
  await upsertNodes(
    driver,
    "Interface",
    interfaces.map((i) => interfaceRow(i, userId, codebaseId)),
  );

  const buckets = new Map<string, RelationEdge[]>();
  for (const e of structuralRelations) {
    const arr = buckets.get(e.kind);
    if (arr) arr.push(e);
    else buckets.set(e.kind, [e]);
  }
  for (const kind of [
    "IMPORTS",
    "CONTAINS",
    "HAS_METHOD",
    "EXTENDS",
    "IMPLEMENTS",
  ] as const) {
    await upsertEdges(driver, kind, buckets.get(kind) ?? []);
  }
  await upsertEdges(driver, "CALLS", calls);
  await upsertProcesses(driver, userId, codebaseId, processes);

  // Mark every node with the parser version so re-sync detection works.
  await runQuery(
    driver,
    `
    MATCH (n { userId: $userId, codebaseId: $codebaseId })
    WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
    SET n.parserVersion = $version
    `,
    { userId, codebaseId, version: PARSER_VERSION },
  );

  return {
    fileCount: files.length,
    functionCount: fns.length,
    classCount: classes.length,
    interfaceCount: interfaces.length,
    callEdgeCount: calls.length,
    processCount: processes.length,
    importEdgeCount: (buckets.get("IMPORTS") ?? []).length,
  };
}
