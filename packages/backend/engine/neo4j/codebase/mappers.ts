/**
 * Neo4j record → typed codebase read shapes.
 */

import { type Record as NeoRecord } from "neo4j-driver";
import { z } from "zod";
import {
  neo4jField,
  neo4jGet,
  neo4jIntSchema,
  parseNeo4jNodeProps,
} from "../record";
import {
  labelsSchema,
  nullableEdgeTierSchema,
  nullableNumberSchema,
  overviewNodePropsSchema,
  processRefListSchema,
  stringArraySchema,
  symbolRefListSchema,
} from "./schemas";
import type {
  OverviewEdge,
  OverviewNode,
  OverviewStats,
  SearchSymbolsResult,
  SymbolContext,
} from "./read";
import type { ImpactNode } from "./impact";

export function parseOverviewStats(record: NeoRecord): OverviewStats {
  return {
    fileCount: neo4jField(record, "fileCount", neo4jIntSchema),
    functionCount: neo4jField(record, "functionCount", neo4jIntSchema),
    classCount: neo4jField(record, "classCount", neo4jIntSchema),
    interfaceCount: neo4jField(record, "interfaceCount", neo4jIntSchema),
    processCount: neo4jField(record, "processCount", neo4jIntSchema),
    callEdgeCount: neo4jField(record, "callEdgeCount", neo4jIntSchema),
    importEdgeCount: neo4jField(record, "importEdgeCount", neo4jIntSchema),
  };
}

function overviewName(
  kind: OverviewNode["kind"],
  props: z.infer<typeof overviewNodePropsSchema>,
): string {
  if (kind === "code-process") return props.name ?? props.id;
  if (kind === "code-file") return props.filename ?? props.path ?? props.id;
  return props.name ?? props.qualifiedName ?? props.id;
}

export function mapOverviewNodeProps(
  kind: OverviewNode["kind"],
  props: z.infer<typeof overviewNodePropsSchema>,
): OverviewNode {
  return {
    id: props.id,
    kind,
    name: overviewName(kind, props),
    path: props.path ?? props.filePath ?? "",
    directory: props.directory ?? "",
    isExported: props.isExported,
    isAsync: props.isAsync,
    isTest: props.isTest,
  };
}

export function parseOverviewNodeRecord(
  record: NeoRecord,
  pickKind: (labels: string[]) => OverviewNode["kind"] | null,
): OverviewNode | null {
  const labels = neo4jField(record, "labels", labelsSchema);
  const kind = pickKind(labels);
  if (!kind) return null;
  const props = parseNeo4jNodeProps(
    neo4jGet(record, "n"),
    overviewNodePropsSchema,
  );
  return mapOverviewNodeProps(kind, props);
}

export function parseStringArrayField(
  record: NeoRecord | undefined,
  key: string,
): string[] {
  if (!record) return [];
  const parsed = stringArraySchema.safeParse(neo4jGet(record, key));
  return parsed.success ? parsed.data : [];
}

export function parseOverviewEdge(
  record: NeoRecord,
  type: OverviewEdge["type"],
  carry: boolean,
): OverviewEdge {
  const fromId = neo4jField(record, "fromId", z.string());
  const toId = neo4jField(record, "toId", z.string());
  const confRaw = neo4jField(record, "confidence", nullableNumberSchema);
  const tierRaw = neo4jField(record, "tier", nullableEdgeTierSchema);
  const tier: OverviewEdge["tier"] =
    carry && tierRaw !== null ? tierRaw : undefined;
  return {
    fromId,
    toId,
    type,
    confidence: carry && confRaw !== null ? confRaw : undefined,
    tier,
  };
}

function filterRefsWithId<T extends { id: string | null }>(
  arr: T[],
): Array<T & { id: string }> {
  return arr.filter(
    (x): x is T & { id: string } => x.id !== null && x.id !== undefined,
  );
}

export function parseSymbolContextRecord(
  record: NeoRecord,
  pickKind: (labels: string[]) => OverviewNode["kind"] | null,
): SymbolContext | null {
  const labels = neo4jField(record, "labels", labelsSchema);
  const kind = pickKind(labels);
  if (!kind) return null;
  const props = parseNeo4jNodeProps(
    neo4jGet(record, "n"),
    overviewNodePropsSchema,
  );
  const callsIn = filterRefsWithId(
    neo4jField(record, "callsIn", symbolRefListSchema),
  );
  const callsOut = filterRefsWithId(
    neo4jField(record, "callsOut", symbolRefListSchema),
  );
  const processes = filterRefsWithId(
    neo4jField(record, "processes", processRefListSchema),
  );
  return {
    id: props.id,
    kind,
    name: props.name ?? props.qualifiedName ?? props.id,
    qualifiedName: props.qualifiedName ?? props.name ?? props.id,
    filePath: props.filePath ?? props.path ?? "",
    startLine: props.startLine,
    endLine: props.endLine,
    isExported: props.isExported,
    isAsync: props.isAsync,
    isTest: props.isTest,
    callsIn,
    callsOut,
    processes,
  };
}

export function parseSearchSymbolRecord(
  record: NeoRecord,
  pickKind: (labels: string[]) => OverviewNode["kind"] | null,
  nodeKey: "node" | "n",
): SearchSymbolsResult | null {
  const labels = neo4jField(record, "labels", labelsSchema);
  const kind = pickKind(labels);
  if (!kind) return null;
  const props = parseNeo4jNodeProps(
    neo4jGet(record, nodeKey),
    overviewNodePropsSchema,
  );
  return {
    id: props.id,
    kind,
    name: props.name ?? props.qualifiedName ?? props.id,
    qualifiedName: props.qualifiedName ?? props.name ?? props.id,
    filePath: props.filePath ?? "",
  };
}

export function parseImpactRecord(record: NeoRecord): ImpactNode {
  return {
    id: neo4jField(record, "id", z.string()),
    distance: neo4jField(record, "distance", neo4jIntSchema),
  };
}
