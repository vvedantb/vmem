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

import Cypher from "@neo4j/cypher-builder";
import type { Driver } from "neo4j-driver";
import { buildAndRun } from "../cypherHelpers";
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isCodeGraphNode(n: Cypher.Node): Cypher.Predicate {
  return Cypher.or(
    n.hasLabel("CodeFile"),
    n.hasLabel("Function"),
    n.hasLabel("Class"),
    n.hasLabel("Interface"),
    n.hasLabel("Process"),
  );
}

/** Open a session, run one clause, and always close it. */
async function runClause(driver: Driver, clause: Cypher.Clause): Promise<void> {
  const session = driver.session();
  try {
    await buildAndRun(session, clause);
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
  const n = new Cypher.NamedNode("n");
  await runClause(
    driver,
    new Cypher.Match(
      new Cypher.Pattern(n, {
        properties: {
          userId: new Cypher.Param(userId),
          codebaseId: new Cypher.Param(codebaseId),
        },
      }),
    )
      .where(
        Cypher.and(
          isCodeGraphNode(n),
          Cypher.not(Cypher.in(n.property("id"), new Cypher.Param(keepIds))),
        ),
      )
      .detachDelete(n),
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
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const row = new Cypher.NamedVariable("row");
    const n = new Cypher.NamedNode("n");
    const nowParam = new Cypher.Param(now);
    const setParams: Cypher.SetParam[] = [
      [n, "+=", row.property("props")],
      [
        n.property("createdAt"),
        Cypher.coalesce(n.property("createdAt"), nowParam),
      ],
    ];
    if (touchUpdatedAt) {
      setParams.splice(1, 0, [n.property("updatedAt"), nowParam]);
    }
    await runClause(
      driver,
      new Cypher.Unwind([new Cypher.Param(batch), row])
        .merge(
          new Cypher.Pattern(n, {
            labels: [label],
            properties: { id: row.property("id") },
          }),
        )
        .set(...setParams),
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
  type: EdgeKind,
  edges: RelationEdge[],
): Promise<void> {
  if (edges.length === 0) return;
  for (const batch of chunk(edges, CHUNK_SIZE)) {
    const row = new Cypher.NamedVariable("row");
    const a = new Cypher.NamedNode("a");
    const b = new Cypher.NamedNode("b");
    const r = new Cypher.NamedRelationship("r");
    await runClause(
      driver,
      new Cypher.Unwind([
        new Cypher.Param(
          batch.map((e) => ({
            fromId: e.fromId,
            toId: e.toId,
            props: edgeProps(e),
          })),
        ),
        row,
      ])
        .match(
          new Cypher.Pattern(a, {
            properties: { id: row.property("fromId") },
          }),
        )
        .match(
          new Cypher.Pattern(b, {
            properties: { id: row.property("toId") },
          }),
        )
        .merge(
          new Cypher.Pattern(a).related(r, { type, direction: "right" }).to(b),
        )
        .set([r, "+=", row.property("props")]),
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

/** MERGE labeled endpoints with a fixed relationship type (no edge props). */
async function upsertLabeledEdges(
  driver: Driver,
  edgeType: EdgeKind,
  fromLabel: CodeNodeLabel,
  toLabel: CodeNodeLabel,
  rows: Array<{ fromId: string; toId: string }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const row = new Cypher.NamedVariable("row");
    const a = new Cypher.NamedNode("a");
    const b = new Cypher.NamedNode("b");
    await runClause(
      driver,
      new Cypher.Unwind([new Cypher.Param(batch), row])
        .match(
          new Cypher.Pattern(a, {
            labels: [fromLabel],
            properties: { id: row.property("fromId") },
          }),
        )
        .match(
          new Cypher.Pattern(b, {
            labels: [toLabel],
            properties: { id: row.property("toId") },
          }),
        )
        .merge(
          new Cypher.Pattern(a)
            .related({ type: edgeType, direction: "right" })
            .to(b),
        ),
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

  const n = new Cypher.NamedNode("n");
  await runClause(
    driver,
    new Cypher.Match(
      new Cypher.Pattern(n, {
        properties: {
          userId: new Cypher.Param(userId),
          codebaseId: new Cypher.Param(codebaseId),
        },
      }),
    )
      .where(isCodeGraphNode(n))
      .set([n.property("parserVersion"), new Cypher.Param(PARSER_VERSION)]),
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
