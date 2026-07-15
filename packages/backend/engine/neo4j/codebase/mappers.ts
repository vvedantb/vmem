import type { Record as NeoRecord } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { z } from "zod";
import {
  neo4jField,
  neo4jGet,
  neo4jIntSchema,
  nullableNumberSchema,
  parseNeo4jInt,
  parseNeo4jNodeProps,
  stringSchema,
} from "../record";
import type {
  OverviewEdge,
  OverviewNode,
  OverviewStats,
  SearchSymbolsResult,
  SymbolContext,
} from "./read";
import type { ImpactNode } from "./impact";

const optionalNeo4jIntSchema = z
  .custom<number | undefined>((v) => {
    if (v === undefined || v === null) return true;
    return typeof v === "number" || neo4j.isInt(v);
  })
  .transform((v): number | undefined => {
    if (v == null) return undefined;
    return parseNeo4jInt(v);
  });

const overviewNodePropsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  qualifiedName: z.string().optional(),
  path: z.string().optional(),
  filePath: z.string().optional(),
  filename: z.string().optional(),
  directory: z.string().optional(),
  isExported: z.boolean().optional(),
  isAsync: z.boolean().optional(),
  isTest: z.boolean().optional(),
  startLine: optionalNeo4jIntSchema,
  endLine: optionalNeo4jIntSchema,
});

type OverviewNodeProps = z.infer<typeof overviewNodePropsSchema>;

const labelsSchema = z.array(z.string());

const stringArraySchema = z.array(z.string());

const nullableEdgeTierSchema = z
  .enum(["EXTRACTED", "INFERRED", "AMBIGUOUS"])
  .nullable();

const symbolRefSchema = z.object({
  id: z.string().nullable(),
  name: z.string().optional(),
  filePath: z.string().optional(),
});

const symbolRefListSchema = z.array(symbolRefSchema);

const processRefSchema = z.object({
  id: z.string().nullable(),
  name: z.string().optional(),
});

const processRefListSchema = z.array(processRefSchema);

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
  props: OverviewNodeProps,
): string {
  if (kind === "code-process") return props.name ?? props.id;
  if (kind === "code-file") return props.filename ?? props.path ?? props.id;
  return props.name ?? props.qualifiedName ?? props.id;
}

function mapOverviewNodeProps(
  kind: OverviewNode["kind"],
  props: OverviewNodeProps,
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
  const parsed = parseOverviewPropsRecord(record, pickKind);
  if (!parsed) return null;
  return mapOverviewNodeProps(parsed.kind, parsed.props);
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
  const fromId = neo4jField(record, "fromId", stringSchema);
  const toId = neo4jField(record, "toId", stringSchema);
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

function mapSymbolRefs(
  refs: z.infer<typeof symbolRefListSchema>,
): SymbolContext["callsIn"] {
  return refs
    .filter(
      (x): x is z.infer<typeof symbolRefSchema> & { id: string } =>
        x.id !== null,
    )
    .map((x) => ({
      id: x.id,
      name: x.name ?? x.id,
      filePath: x.filePath ?? "",
    }));
}

function mapProcessRefs(
  refs: z.infer<typeof processRefListSchema>,
): SymbolContext["processes"] {
  return refs
    .filter(
      (x): x is z.infer<typeof processRefSchema> & { id: string } =>
        x.id !== null,
    )
    .map((x) => ({
      id: x.id,
      name: x.name ?? x.id,
    }));
}

function nameAndQualifiedName(props: OverviewNodeProps): {
  name: string;
  qualifiedName: string;
} {
  return {
    name: props.name ?? props.qualifiedName ?? props.id,
    qualifiedName: props.qualifiedName ?? props.name ?? props.id,
  };
}

function parseOverviewPropsRecord(
  record: NeoRecord,
  pickKind: (labels: string[]) => OverviewNode["kind"] | null,
  nodeKey: "node" | "n" = "n",
): {
  kind: OverviewNode["kind"];
  props: OverviewNodeProps;
} | null {
  const labels = neo4jField(record, "labels", labelsSchema);
  const kind = pickKind(labels);
  if (!kind) return null;
  const props = parseNeo4jNodeProps(
    neo4jGet(record, nodeKey),
    overviewNodePropsSchema,
  );
  return { kind, props };
}

export function parseSymbolContextRecord(
  record: NeoRecord,
  pickKind: (labels: string[]) => OverviewNode["kind"] | null,
): SymbolContext | null {
  const parsed = parseOverviewPropsRecord(record, pickKind);
  if (!parsed) return null;
  const { kind, props } = parsed;
  const callsIn = mapSymbolRefs(
    neo4jField(record, "callsIn", symbolRefListSchema),
  );
  const callsOut = mapSymbolRefs(
    neo4jField(record, "callsOut", symbolRefListSchema),
  );
  const processes = mapProcessRefs(
    neo4jField(record, "processes", processRefListSchema),
  );
  return {
    id: props.id,
    kind,
    ...nameAndQualifiedName(props),
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
  const parsed = parseOverviewPropsRecord(record, pickKind, nodeKey);
  if (!parsed) return null;
  const { kind, props } = parsed;
  return {
    id: props.id,
    kind,
    ...nameAndQualifiedName(props),
    filePath: props.filePath ?? "",
  };
}

export function parseImpactRecord(record: NeoRecord): ImpactNode {
  return {
    id: neo4jField(record, "id", stringSchema),
    distance: neo4jField(record, "distance", neo4jIntSchema),
  };
}
