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
  const session = driver.session();
  try {
    await session.run(
      `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
        AND NOT n.id IN $keepIds
      DETACH DELETE n
      `,
      { userId, codebaseId, keepIds },
    );
  } finally {
    await session.close();
  }
}

async function upsertFiles(
  driver: Driver,
  userId: string,
  codebaseId: string,
  files: FileNode[],
): Promise<void> {
  const now = Date.now();
  for (const batch of chunk(files, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (n:CodeFile { id: row.id })
        SET n += row.props
        SET n.updatedAt = $now
        SET n.createdAt = coalesce(n.createdAt, $now)
        `,
        {
          rows: batch.map((f) => ({
            id: f.id,
            props: {
              userId,
              codebaseId,
              path: f.path,
              directory: f.directory,
              filename: f.filename,
              extension: f.extension,
              sizeBytes: f.sizeBytes,
              contentHash: f.contentHash,
            },
          })),
          now,
        },
      );
    } finally {
      await session.close();
    }
  }
}

async function upsertFunctions(
  driver: Driver,
  userId: string,
  codebaseId: string,
  fns: FunctionNode[],
): Promise<void> {
  const now = Date.now();
  for (const batch of chunk(fns, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (n:Function { id: row.id })
        SET n += row.props
        SET n.updatedAt = $now
        SET n.createdAt = coalesce(n.createdAt, $now)
        `,
        {
          rows: batch.map((f) => ({
            id: f.id,
            props: {
              userId,
              codebaseId,
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
            },
          })),
          now,
        },
      );
    } finally {
      await session.close();
    }
  }
}

async function upsertClasses(
  driver: Driver,
  userId: string,
  codebaseId: string,
  classes: ClassNode[],
): Promise<void> {
  const now = Date.now();
  for (const batch of chunk(classes, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (n:Class { id: row.id })
        SET n += row.props
        SET n.updatedAt = $now
        SET n.createdAt = coalesce(n.createdAt, $now)
        `,
        {
          rows: batch.map((c) => ({
            id: c.id,
            props: {
              userId,
              codebaseId,
              filePath: c.filePath,
              name: c.name,
              qualifiedName: c.qualifiedName,
              startLine: c.startLine,
              endLine: c.endLine,
              isExported: c.isExported,
              isAbstract: c.isAbstract,
              extendsName: c.extendsName ?? null,
            },
          })),
          now,
        },
      );
    } finally {
      await session.close();
    }
  }
}

async function upsertInterfaces(
  driver: Driver,
  userId: string,
  codebaseId: string,
  ifaces: InterfaceNode[],
): Promise<void> {
  const now = Date.now();
  for (const batch of chunk(ifaces, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (n:Interface { id: row.id })
        SET n += row.props
        SET n.updatedAt = $now
        SET n.createdAt = coalesce(n.createdAt, $now)
        `,
        {
          rows: batch.map((i) => ({
            id: i.id,
            props: {
              userId,
              codebaseId,
              filePath: i.filePath,
              name: i.name,
              qualifiedName: i.qualifiedName,
              startLine: i.startLine,
              endLine: i.endLine,
              isExported: i.isExported,
            },
          })),
          now,
        },
      );
    } finally {
      await session.close();
    }
  }
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
    const session = driver.session();
    try {
      await session.run(
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
    } finally {
      await session.close();
    }
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

async function upsertProcesses(
  driver: Driver,
  userId: string,
  codebaseId: string,
  processes: ProcessNode[],
): Promise<void> {
  if (processes.length === 0) return;
  const now = Date.now();
  for (const batch of chunk(processes, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MERGE (n:Process { id: row.id })
        SET n += row.props
        SET n.createdAt = coalesce(n.createdAt, $now)
        `,
        {
          rows: batch.map((p) => ({
            id: p.id,
            props: {
              userId,
              codebaseId,
              name: p.name,
              entryPointId: p.entryPointId,
              entryKind: p.entryKind,
              nodeCount: p.members.length,
            },
          })),
          now,
        },
      );
    } finally {
      await session.close();
    }
  }

  // STARTS_PROCESS edges (entry function → process).
  const startsRows: { fromId: string; toId: string }[] = processes.map((p) => ({
    fromId: p.entryPointId,
    toId: p.id,
  }));
  for (const batch of chunk(startsRows, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MATCH (a:Function { id: row.fromId })
        MATCH (b:Process { id: row.toId })
        MERGE (a)-[:STARTS_PROCESS]->(b)
        `,
        { rows: batch },
      );
    } finally {
      await session.close();
    }
  }

  // INCLUDES edges (process → each member function).
  const includes: { fromId: string; toId: string }[] = [];
  for (const p of processes) {
    for (const memberId of p.members) {
      includes.push({ fromId: p.id, toId: memberId });
    }
  }
  for (const batch of chunk(includes, CHUNK_SIZE)) {
    const session = driver.session();
    try {
      await session.run(
        `
        UNWIND $rows AS row
        MATCH (a:Process { id: row.fromId })
        MATCH (b:Function { id: row.toId })
        MERGE (a)-[:INCLUDES]->(b)
        `,
        { rows: batch },
      );
    } finally {
      await session.close();
    }
  }
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
  await upsertFiles(driver, userId, codebaseId, files);
  await upsertFunctions(driver, userId, codebaseId, fns);
  await upsertClasses(driver, userId, codebaseId, classes);
  await upsertInterfaces(driver, userId, codebaseId, interfaces);

  // Bucket structural relations by type.
  const buckets = new Map<string, RelationEdge[]>();
  for (const e of structuralRelations) {
    let arr = buckets.get(e.kind);
    if (!arr) {
      arr = [];
      buckets.set(e.kind, arr);
    }
    arr.push(e);
  }
  await upsertEdges(driver, "IMPORTS", buckets.get("IMPORTS") ?? []);
  await upsertEdges(driver, "CONTAINS", buckets.get("CONTAINS") ?? []);
  await upsertEdges(driver, "HAS_METHOD", buckets.get("HAS_METHOD") ?? []);
  await upsertEdges(driver, "EXTENDS", buckets.get("EXTENDS") ?? []);
  await upsertEdges(driver, "IMPLEMENTS", buckets.get("IMPLEMENTS") ?? []);
  await upsertEdges(driver, "CALLS", calls);

  await upsertProcesses(driver, userId, codebaseId, processes);

  // Mark every node with the parser version so re-sync detection works.
  const versionSession = driver.session();
  try {
    await versionSession.run(
      `
      MATCH (n { userId: $userId, codebaseId: $codebaseId })
      WHERE (n:CodeFile OR n:Function OR n:Class OR n:Interface OR n:Process)
      SET n.parserVersion = $version
      `,
      { userId, codebaseId, version: PARSER_VERSION },
    );
  } finally {
    await versionSession.close();
  }

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
