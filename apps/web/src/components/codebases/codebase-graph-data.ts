/**
 * Pure transformation functions for codebase symbol graph data.
 *
 * Converts the Phase-1 codebase payload (files + functions + classes +
 * interfaces + processes, with imports/calls/contains/has_method/extends/
 * implements/starts_process/includes edges) into canvas-ready GraphNode +
 * GraphEdge arrays. The renderer's existing kind→shape mapping handles
 * the visual dispatch — this module just shapes the data.
 */
import type {
  GraphNode,
  GraphEdge,
  GraphNodeKind,
  GraphEdgeType,
} from "@/components/_components/canvas/types";
import type {
  CodeNode,
  CodeEdge,
  CodeNodeKind,
} from "@/hooks/useCodebaseGraphData";

// ---- Directory stats ----

export interface DirectoryStat {
  directory: string;
  count: number;
}

/**
 * Get unique directories with file counts, sorted by count desc.
 *
 * Counts are computed against `code-file` nodes only because directories
 * are a per-file concept; functions/classes inherit their directory from
 * their containing file (already factored into the file count).
 */
export function getAllDirectories(nodes: CodeNode[]): DirectoryStat[] {
  const dirCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.kind !== "code-file") continue;
    const dir = node.directory || "(root)";
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }
  return Array.from(dirCounts.entries())
    .map(([directory, count]) => ({ directory, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- Node-size scaling ----

/**
 * Per-kind base size + degree scaling factor. Processes and files are visible
 * "hubs" so they get more visual weight than individual functions/methods.
 */
const SIZE_CONFIG: Record<
  CodeNodeKind,
  { base: number; perDegree: number; max: number }
> = {
  "code-process": { base: 5.5, perDegree: 0.3, max: 11 },
  "code-file": { base: 3.5, perDegree: 0.4, max: 8.5 },
  "code-class": { base: 3.5, perDegree: 0.35, max: 8 },
  "code-interface": { base: 3, perDegree: 0.3, max: 7 },
  "code-function": { base: 2.5, perDegree: 0.3, max: 7 },
};

// ---- Build graph data ----

interface BuildOptions {
  /** Empty set = "show all directories". Otherwise restrict files to these dirs. */
  activeDirectories: Set<string>;
  /** Empty set = "hide everything". Otherwise restrict to these kinds. */
  activeKinds: Set<CodeNodeKind>;
}

/**
 * Transform the codebase symbol payload into canvas-ready nodes + edges.
 *
 * Filtering rules:
 *   - `activeDirectories` (when non-empty) drops files outside those dirs and
 *     orphans their child symbols by extension (no parent file → drop). This
 *     is purely client-side because the user toggles directories in the same
 *     popover that would otherwise round-trip to Neo4j on each click.
 *   - Edges are pruned to those whose endpoints both survived filtering.
 *
 * Server-side filtering (`kinds`, `processId`, `blastRadiusOf`) happens
 * upstream in the Convex action, so by the time we reach this function the
 * payload is already trimmed for those concerns.
 */
export function buildCodebaseGraphData(
  apiNodes: CodeNode[],
  apiEdges: CodeEdge[],
  options: BuildOptions,
): { graphNodes: GraphNode[]; graphEdges: GraphEdge[] } {
  if (apiNodes.length === 0) {
    return { graphNodes: [], graphEdges: [] };
  }

  // --- Stage 1: determine which file IDs survive directory filtering. ---
  const activeDirs = options.activeDirectories;
  const filterByDir = activeDirs.size > 0;
  const fileNodeById = new Map<string, CodeNode>();
  const survivingFileIds = new Set<string>();
  for (const node of apiNodes) {
    if (node.kind !== "code-file") continue;
    fileNodeById.set(node.id, node);
    const dir = node.directory || "(root)";
    if (!filterByDir || activeDirs.has(dir)) {
      survivingFileIds.add(node.id);
    }
  }

  // --- Stage 2: Build a child→parent file map from CONTAINS edges so we can
  // drop symbols whose host file was filtered out. Class methods don't have a
  // direct CONTAINS edge from a file — they live under (Class)-[:HAS_METHOD]->
  // — so we also chase HAS_METHOD edges through their parent class.
  const symbolToFile = new Map<string, string>();
  const classToFile = new Map<string, string>();
  for (const edge of apiEdges) {
    if (edge.type === "contains") {
      symbolToFile.set(edge.toId, edge.fromId);
      // Track classes too so HAS_METHOD edges below can resolve.
      const child = apiNodes.find((n) => n.id === edge.toId);
      if (child?.kind === "code-class" || child?.kind === "code-interface") {
        classToFile.set(edge.toId, edge.fromId);
      }
    }
  }
  for (const edge of apiEdges) {
    if (edge.type === "has_method") {
      const fileId = classToFile.get(edge.fromId);
      if (fileId) symbolToFile.set(edge.toId, fileId);
    }
  }

  // --- Stage 3: Decide which nodes survive directory + kind filtering. ---
  const surviving = new Set<string>();
  for (const node of apiNodes) {
    if (!options.activeKinds.has(node.kind)) continue;
    if (node.kind === "code-file") {
      if (survivingFileIds.has(node.id)) surviving.add(node.id);
      continue;
    }
    if (node.kind === "code-process") {
      // Processes are top-level entities (not directory-scoped) — keep them.
      surviving.add(node.id);
      continue;
    }
    // Function / Class / Interface — keep when host file survived. If we have
    // no parent record (older payload, orphan symbol), keep it as a fallback.
    const parentFile = symbolToFile.get(node.id);
    if (!filterByDir || !parentFile || survivingFileIds.has(parentFile)) {
      surviving.add(node.id);
    }
  }

  // --- Stage 4: Compute degree per node for size scaling. ---
  const degree = new Map<string, number>();
  for (const edge of apiEdges) {
    if (!surviving.has(edge.fromId) || !surviving.has(edge.toId)) continue;
    degree.set(edge.fromId, (degree.get(edge.fromId) ?? 0) + 1);
    degree.set(edge.toId, (degree.get(edge.toId) ?? 0) + 1);
  }

  // --- Stage 5: Map to canvas GraphNode shape. ---
  const graphNodes: GraphNode[] = [];
  for (const node of apiNodes) {
    if (!surviving.has(node.id)) continue;
    const cfg = SIZE_CONFIG[node.kind];
    const d = degree.get(node.id) ?? 0;
    const size = Math.min(cfg.base + d * cfg.perDegree, cfg.max);
    // Display directory as a tag so the existing legend / hover affordance
    // reads naturally, even though codebase nodes don't carry user tags.
    const dir = node.directory || "(root)";
    const tags = node.kind === "code-process" ? [] : [dir];
    graphNodes.push({
      id: node.id,
      title: node.name,
      // Inline the path into `content` so the search match-set check (which
      // looks at title + content) can fuzzy-match on file paths.
      content: node.path,
      tags,
      createdAt: "",
      color: "",
      size,
      kind: node.kind satisfies GraphNodeKind,
      sourceType: null,
    });
  }

  // --- Stage 6: Map to canvas GraphEdge shape. ---
  const edgeTypeMap: Record<CodeEdge["type"], GraphEdgeType> = {
    imports: "imports",
    calls: "calls",
    contains: "contains",
    has_method: "has_method",
    extends: "extends",
    implements: "implements",
    starts_process: "starts_process",
    includes: "includes",
  };
  // Confidence drives visual weight on the renderer where supported. For
  // structural edges (no confidence stored) we collapse to 1 so they read as
  // crisp lines, matching their "this is structural truth" semantics.
  const graphEdges: GraphEdge[] = [];
  for (const edge of apiEdges) {
    if (!surviving.has(edge.fromId) || !surviving.has(edge.toId)) continue;
    graphEdges.push({
      source: edge.fromId,
      target: edge.toId,
      edgeType: edgeTypeMap[edge.type],
      weight: edge.confidence ?? 1,
    });
  }

  return { graphNodes, graphEdges };
}
