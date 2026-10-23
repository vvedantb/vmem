// graph snapshot (precomputed, from file storage) plus the live delta since
// it was built; see convex graphSnapshots.ts
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import type { GraphSnapshotGraph, GraphSnapshotNode } from "@vmem/shared";
import { isMemoryType } from "@/lib/memories";
import type {
  ApiGraphNode,
  ApiMentionsEdge,
  ApiRelatesToEdge,
} from "./graph-data";

export type GraphDelta = FunctionReturnType<
  typeof api.graphSnapshots.getGraphDelta
>;

export interface SnapshotGraph {
  nodes: ApiGraphNode[];
  relatesToEdges: ApiRelatesToEdge[];
  mentionsEdges: ApiMentionsEdge[];
}

function toApiGraphNode(node: GraphSnapshotNode): ApiGraphNode {
  const { type, ...rest } = node;
  return type !== undefined && isMemoryType(type) ? { ...rest, type } : rest;
}

// Deleted memories go, with their edges and the entities only they
// mentioned. Changed memories replace their snapshot node, new ones are
// added, the skill list is replaced whole, and new links are added once.
export function mergeSnapshotDelta(
  snapshot: GraphSnapshotGraph,
  delta: GraphDelta | undefined,
): SnapshotGraph {
  if (delta === undefined || delta.needsRefresh) {
    return {
      nodes: snapshot.nodes.map(toApiGraphNode),
      relatesToEdges: snapshot.relatesToEdges,
      mentionsEdges: snapshot.mentionsEdges,
    };
  }

  const deleted = new Set(delta.deletedMemoryIds);
  const changed = new Map(delta.memories.map((node) => [node.id, node]));
  const nodeById = new Map<string, ApiGraphNode>();
  for (const node of snapshot.nodes) {
    if (node.kind === "skill" || deleted.has(node.id)) continue;
    nodeById.set(node.id, changed.get(node.id) ?? toApiGraphNode(node));
  }
  for (const node of delta.memories) {
    if (!deleted.has(node.id)) nodeById.set(node.id, node);
  }

  const mentionsEdges = snapshot.mentionsEdges.filter(
    (edge) => !deleted.has(edge.source),
  );
  const mentioned = new Set(mentionsEdges.map((edge) => edge.target));
  for (const node of snapshot.nodes) {
    if (node.kind === "entity" && !mentioned.has(node.id)) {
      nodeById.delete(node.id);
    }
  }
  for (const node of delta.skills) nodeById.set(node.id, node);

  const relatesToEdges: ApiRelatesToEdge[] = [];
  const seenPairs = new Set<string>();
  for (const edge of [...snapshot.relatesToEdges, ...delta.links]) {
    if (deleted.has(edge.source) || deleted.has(edge.target)) continue;
    const key = `${edge.source}|${edge.target}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    relatesToEdges.push(edge);
  }

  return { nodes: [...nodeById.values()], relatesToEdges, mentionsEdges };
}
