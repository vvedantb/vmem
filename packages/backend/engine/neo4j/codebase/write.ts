import type { Driver } from "neo4j-driver";
import { chunk, groupBy } from "es-toolkit/array";
import { PARSER_VERSION } from "@vmem/shared";
import type {
  ParseStats,
  ProcessNode,
  RelationEdge,
  SymbolNode,
  FileNode,
  FunctionNode,
  ClassNode,
  InterfaceNode,
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

type StructuralEdgeKind =
  | "IMPORTS"
  | "CONTAINS"
  | "HAS_METHOD"
  | "EXTENDS"
  | "IMPLEMENTS";

type EdgeKind = StructuralEdgeKind | "CALLS" | "STARTS_PROCESS" | "INCLUDES";

interface WriteArgs {
  driver: Driver;
  userId: string;
  codebaseId: string;
  symbols: SymbolNode[];
  structuralRelations: RelationEdge[];
  calls: RelationEdge[];
  processes: ProcessNode[];
}

async function deleteStale(
  driver: Driver,
  userId: string,
  codebaseId: string,
  keepIds: string[],
): Promise<void> {
  await driver.executeQuery(
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
    await driver.executeQuery(
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

function makeRow(
  id: string,
  userId: string,
  codebaseId: string,
  fields: Record<string, Neo4jPropValue>,
): UpsertRow {
  return {
    id,
    props: { userId, codebaseId, parserVersion: PARSER_VERSION, ...fields },
  };
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

async function upsertEdges(
  driver: Driver,
  type: EdgeKind,
  edges: RelationEdge[],
): Promise<void> {
  if (edges.length === 0) return;
  for (const batch of chunk(edges, CHUNK_SIZE)) {
    await driver.executeQuery(
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

function edgeProps(e: RelationEdge): Record<string, Neo4jPropValue> {
  const out: Record<string, Neo4jPropValue> = {};
  if (e.confidence !== undefined) out.confidence = e.confidence;
  if (e.tier !== undefined) out.tier = e.tier;
  if (e.importPath !== undefined) out.importPath = e.importPath;
  if (e.callSiteLine !== undefined) out.callSiteLine = e.callSiteLine;
  return out;
}

async function upsertLabeledEdges(
  driver: Driver,
  edgeType: EdgeKind,
  fromLabel: CodeNodeLabel,
  toLabel: CodeNodeLabel,
  rows: Array<{ fromId: string; toId: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    await driver.executeQuery(
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

// AI-generated (Claude), prompt: "upsert parsed codebase graph into neo4j with stale node deletion and typed edge batches"
// Modified by me: batched row shapes and process include edges for sync safety
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

  const keepIds = [
    ...symbols.map((symbol) => symbol.id),
    ...processes.map((process) => process.id),
  ];
  const fileRows: UpsertRow[] = [];
  const functionRows: UpsertRow[] = [];
  const classRows: UpsertRow[] = [];
  const interfaceRows: UpsertRow[] = [];

  for (const sym of symbols) {
    switch (sym.kind) {
      case "file":
        fileRows.push(fileRow(sym, userId, codebaseId));
        break;
      case "function":
        functionRows.push(functionRow(sym, userId, codebaseId));
        break;
      case "class":
        classRows.push(classRow(sym, userId, codebaseId));
        break;
      case "interface":
        interfaceRows.push(interfaceRow(sym, userId, codebaseId));
        break;
    }
  }
  const buckets = groupBy(structuralRelations, (e) => e.kind);

  await deleteStale(driver, userId, codebaseId, keepIds);
  await upsertNodes(driver, "CodeFile", fileRows);
  await upsertNodes(driver, "Function", functionRows);
  await upsertNodes(driver, "Class", classRows);
  await upsertNodes(driver, "Interface", interfaceRows);

  for (const kind of [
    "IMPORTS",
    "CONTAINS",
    "HAS_METHOD",
    "EXTENDS",
    "IMPLEMENTS",
  ] as const) {
    await upsertEdges(driver, kind, buckets[kind] ?? []);
  }
  await upsertEdges(driver, "CALLS", calls);
  await upsertProcesses(driver, userId, codebaseId, processes);

  return {
    fileCount: fileRows.length,
    functionCount: functionRows.length,
    classCount: classRows.length,
    interfaceCount: interfaceRows.length,
    callEdgeCount: calls.length,
    processCount: processes.length,
    importEdgeCount: buckets.IMPORTS?.length ?? 0,
  };
}
