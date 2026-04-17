/**
 * Pure transformation functions for codebase file graph data.
 * Converts API response into canvas-ready GraphNode/GraphEdge arrays.
 */
import type {
  GraphNode,
  GraphEdge,
} from "@/components/_components/canvas/types";
import type { CodeFileNode, ImportEdge } from "@/hooks/useCodebaseGraphData";

// ---- Directory stats ----

export interface DirectoryStat {
  directory: string;
  count: number;
}

/** Get unique directories with file counts, sorted by count desc. */
export function getAllDirectories(nodes: CodeFileNode[]): DirectoryStat[] {
  const dirCounts = new Map<string, number>();
  for (const node of nodes) {
    const dir = node.directory || "(root)";
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }
  return Array.from(dirCounts.entries())
    .map(([directory, count]) => ({ directory, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Build graph data ----

/**
 * Transform codebase API data into canvas-ready nodes + edges.
 * When activeDirectories is non-empty, only files in those dirs are shown.
 */
export function buildCodebaseGraphData(
  apiNodes: CodeFileNode[],
  apiEdges: ImportEdge[],
  activeDirectories: Set<string>,
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  if (apiNodes.length === 0) {
    return { graphNodes: [], graphEdges: [] };
  }

  // Filter by active directories
  const filteredNodes =
    activeDirectories.size > 0
      ? apiNodes.filter((n) => {
          const dir = n.directory || "(root)";
          return activeDirectories.has(dir);
        })
      : apiNodes;

  // Count imports per file (in-degree + out-degree)
  const degreeCount = new Map<string, number>();
  for (const edge of apiEdges) {
    degreeCount.set(edge.source, (degreeCount.get(edge.source) ?? 0) + 1);
    degreeCount.set(edge.target, (degreeCount.get(edge.target) ?? 0) + 1);
  }

  const nodeSet = new Set(filteredNodes.map((n) => n.id));

  const graphNodes: GraphNode[] = filteredNodes.map((node) => {
    const degree = degreeCount.get(node.id) ?? 0;
    const dir = node.directory || "(root)";
    return {
      id: node.id,
      title: node.filename,
      content: node.path,
      tags: [dir],
      createdAt: "", // Not relevant for code files
      color: "", // Assigned by renderer via tags
      size: Math.min(3 + degree * 0.4, 8),
      // Codebase files reuse the canvas renderer; the default "memory" kind
      // renders them as circles, matching the behaviour before wiki shapes
      // were introduced.
      kind: "memory",
    };
  });

  const graphEdges: GraphEdge[] = [];
  for (const edge of apiEdges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      graphEdges.push({
        source: edge.source,
        target: edge.target,
        weight: 1,
        edgeType: "imports",
        reason: edge.importPath,
      });
    }
  }

  return { graphNodes, graphEdges };
}

// ---- Related files ----

export interface RelatedFile {
  id: string;
  filename: string;
  path: string;
  direction: "imports" | "imported_by";
}

/** Get files related to a given file (imports + imported by). */
export function getRelatedFiles(
  fileId: string,
  graphEdges: GraphEdge[],
  graphNodes: GraphNode[],
): RelatedFile[] {
  const related: RelatedFile[] = [];
  const seen = new Set<string>();

  for (const edge of graphEdges) {
    const sId = typeof edge.source === "string" ? edge.source : edge.source.id;
    const tId = typeof edge.target === "string" ? edge.target : edge.target.id;

    if (sId === fileId && !seen.has(tId)) {
      seen.add(tId);
      const node = graphNodes.find((n) => n.id === tId);
      related.push({
        id: tId,
        filename: node?.title ?? tId,
        path: node?.content ?? tId,
        direction: "imports",
      });
    } else if (tId === fileId && !seen.has(sId)) {
      seen.add(sId);
      const node = graphNodes.find((n) => n.id === sId);
      related.push({
        id: sId,
        filename: node?.title ?? sId,
        path: node?.content ?? sId,
        direction: "imported_by",
      });
    }
  }

  return related;
}
