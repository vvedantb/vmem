/**
 * Compact wire format for the precomputed graph snapshot (convex
 * graphSnapshots.ts writes it to file storage, the web graph view reads it).
 *
 * Nodes are tuples. Edges are flat integer arrays that point into the node
 * list, so no node id repeats. Repeated short strings (tags, sources, types,
 * link reasons) sit once in a dictionary `d`, referenced by index (-1 = none).
 * createdAt is epoch seconds. No memory bodies: the view fetches those on
 * click.
 */
import { z } from "zod";

// bump on any format change; readers treat other versions as missing
export const GRAPH_SNAPSHOT_VERSION = 1;

export interface GraphSnapshotNode {
  id: string;
  title: string;
  tags: string[];
  createdAt: string;
  kind: "memory" | "skill" | "entity";
  source?: string;
  sourceType: string | null;
  type?: string;
  entityType?: string;
  // skill description only
  content?: string;
}

export interface GraphSnapshotGraph {
  nodes: GraphSnapshotNode[];
  relatesToEdges: { source: string; target: string; reason: string }[];
  mentionsEdges: { source: string; target: string }[];
}

const KIND_MEMORY = 0;
const KIND_ENTITY = 1;
const KIND_SKILL = 2;

const ref = z.number().int().min(-1);
const index = z.number().int().nonnegative();

const memoryRow = z.tuple([
  z.literal(KIND_MEMORY),
  z.string(),
  z.string(),
  z.number(),
  // type, source, sourceType
  ref,
  ref,
  ref,
  z.array(index),
]);
const entityRow = z.tuple([
  z.literal(KIND_ENTITY),
  z.string(),
  z.string(),
  z.number(),
  // entityType
  ref,
]);
const skillRow = z.tuple([
  z.literal(KIND_SKILL),
  z.string(),
  z.string(),
  z.number(),
  // description
  z.string(),
]);

const encodedSnapshotSchema = z.object({
  v: z.literal(GRAPH_SNAPSHOT_VERSION),
  d: z.array(z.string()),
  n: z.array(z.union([memoryRow, entityRow, skillRow])),
  // [source, target, reason] triples
  r: z.array(index),
  // [memory, entity] pairs
  m: z.array(index),
});

type EncodedSnapshot = z.infer<typeof encodedSnapshotSchema>;

function toEpochSeconds(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function encodeGraphSnapshot(graph: GraphSnapshotGraph): string {
  const words: string[] = [];
  const wordIndex = new Map<string, number>();
  const word = (value: string | null | undefined): number => {
    if (value === null || value === undefined) return -1;
    const known = wordIndex.get(value);
    if (known !== undefined) return known;
    wordIndex.set(value, words.length);
    words.push(value);
    return words.length - 1;
  };

  const nodeIndex = new Map<string, number>();
  const rows: EncodedSnapshot["n"] = [];
  for (const node of graph.nodes) {
    if (nodeIndex.has(node.id)) continue;
    nodeIndex.set(node.id, rows.length);
    const createdAt = toEpochSeconds(node.createdAt);
    if (node.kind === "memory") {
      rows.push([
        KIND_MEMORY,
        node.id,
        node.title,
        createdAt,
        word(node.type),
        word(node.source),
        word(node.sourceType),
        node.tags.map(word),
      ]);
    } else if (node.kind === "entity") {
      rows.push([
        KIND_ENTITY,
        node.id,
        node.title,
        createdAt,
        word(node.entityType),
      ]);
    } else {
      rows.push([
        KIND_SKILL,
        node.id,
        node.title,
        createdAt,
        node.content ?? "",
      ]);
    }
  }

  // edges whose ends are not nodes are dropped
  const relates: number[] = [];
  for (const edge of graph.relatesToEdges) {
    const source = nodeIndex.get(edge.source);
    const target = nodeIndex.get(edge.target);
    if (source === undefined || target === undefined) continue;
    relates.push(source, target, word(edge.reason));
  }
  const mentions: number[] = [];
  for (const edge of graph.mentionsEdges) {
    const source = nodeIndex.get(edge.source);
    const target = nodeIndex.get(edge.target);
    if (source === undefined || target === undefined) continue;
    mentions.push(source, target);
  }

  const encoded: EncodedSnapshot = {
    v: GRAPH_SNAPSHOT_VERSION,
    d: words,
    n: rows,
    r: relates,
    m: mentions,
  };
  return JSON.stringify(encoded);
}

// throws on a malformed body or an out-of-range reference
export function decodeGraphSnapshot(json: string): GraphSnapshotGraph {
  const encoded = encodedSnapshotSchema.parse(JSON.parse(json));
  const word = (at: number): string | undefined => {
    if (at === -1) return undefined;
    const value = encoded.d[at];
    if (value === undefined) {
      throw new Error(`graph snapshot: bad dictionary index ${String(at)}`);
    }
    return value;
  };
  const nodeId = (at: number | undefined): string => {
    const row = at === undefined ? undefined : encoded.n[at];
    if (row === undefined) {
      throw new Error(`graph snapshot: bad node index ${String(at)}`);
    }
    return row[1];
  };

  const nodes = encoded.n.map((row): GraphSnapshotNode => {
    const base = {
      id: row[1],
      title: row[2],
      createdAt: new Date(row[3] * 1000).toISOString(),
    };
    if (row[0] === KIND_MEMORY) {
      const type = word(row[4]);
      const source = word(row[5]);
      return {
        ...base,
        kind: "memory",
        tags: row[7].map((at) => word(at) ?? ""),
        sourceType: word(row[6]) ?? null,
        ...(type === undefined ? {} : { type }),
        ...(source === undefined ? {} : { source }),
      };
    }
    if (row[0] === KIND_ENTITY) {
      const entityType = word(row[4]);
      return {
        ...base,
        kind: "entity",
        tags: [],
        sourceType: null,
        ...(entityType === undefined ? {} : { entityType }),
      };
    }
    return {
      ...base,
      kind: "skill",
      tags: [],
      sourceType: null,
      content: row[4],
    };
  });

  const relatesToEdges: GraphSnapshotGraph["relatesToEdges"] = [];
  for (let i = 0; i + 2 < encoded.r.length; i += 3) {
    relatesToEdges.push({
      source: nodeId(encoded.r[i]),
      target: nodeId(encoded.r[i + 1]),
      reason: word(encoded.r[i + 2] ?? -1) ?? "",
    });
  }
  const mentionsEdges: GraphSnapshotGraph["mentionsEdges"] = [];
  for (let i = 0; i + 1 < encoded.m.length; i += 2) {
    mentionsEdges.push({
      source: nodeId(encoded.m[i]),
      target: nodeId(encoded.m[i + 1]),
    });
  }
  return { nodes, relatesToEdges, mentionsEdges };
}
