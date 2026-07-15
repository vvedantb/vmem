import type { GraphEdge, GraphEdgeType, GraphNode } from "@/lib/graph/types";
import type { GraphViewTheme } from "../graph-view-themes";
import { nodeColor as getNodeColor } from "../graph-colors";
import { colorToRgba, writeRgba } from "./cosmos-color";

// Palette slots on GraphViewTheme.edge.normalByType — mirrors canvas/renderer.ts
type EdgePaletteSlot = keyof GraphViewTheme["edge"]["normalByType"];

const EDGE_SLOT: Record<GraphEdgeType, EdgePaletteSlot> = {
  tag: "tag",
  relates_to: "relates_to",
  imports: "relates_to",
  calls: "relates_to",
  wiki_parent: "wiki_parent",
  contains: "wiki_parent",
  has_method: "wiki_parent",
  extends: "wiki_parent",
  implements: "wiki_parent",
  mentions: "mentions",
  starts_process: "mentions",
  includes: "mentions",
};

export interface CosmosEdgeMeta {
  edgeType: GraphEdgeType;
  sourceTitle: string;
  targetTitle: string;
  reason: string | null;
  score: number | undefined;
  sourceIndex: number;
  targetIndex: number;
}

export interface CosmosGraphBuffers {
  idToIndex: Map<string, number>;
  indexToId: string[];
  indexToNode: GraphNode[];
  edgeMeta: CosmosEdgeMeta[];
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  links: Float32Array;
  linkColors: Float32Array;
}

function edgeEndpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === "string" ? endpoint : endpoint.id;
}

function seedPosition(
  index: number,
  count: number,
  node: GraphNode,
  spaceSize: number,
): { x: number; y: number } {
  if (node.x !== undefined && node.y !== undefined) {
    return { x: node.x, y: node.y };
  }
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const radius = spaceSize * 0.28;
  const cx = spaceSize / 2;
  const cy = spaceSize / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function paintNodeColor(
  colors: Float32Array,
  index: number,
  node: GraphNode,
  theme: GraphViewTheme,
): void {
  writeRgba(
    colors,
    index * 4,
    colorToRgba(
      getNodeColor(
        node.tags,
        node.kind,
        theme.isDarkCanvas,
        theme.nodeColorOverride,
      ),
    ),
  );
}

/** Build Cosmos index-based Float32Arrays + id↔index / edge meta maps. */
export function buildCosmosGraphBuffers(
  nodes: GraphNode[],
  edges: GraphEdge[],
  theme: GraphViewTheme,
  spaceSize = 4096,
): CosmosGraphBuffers {
  const idToIndex = new Map<string, number>();
  const indexToId: string[] = [];
  const indexToNode: GraphNode[] = [];

  const positions = new Float32Array(nodes.length * 2);
  const colors = new Float32Array(nodes.length * 4);
  const sizes = new Float32Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    idToIndex.set(node.id, i);
    indexToId.push(node.id);
    indexToNode.push(node);

    const pos = seedPosition(i, nodes.length, node, spaceSize);
    positions[i * 2] = pos.x;
    positions[i * 2 + 1] = pos.y;

    paintNodeColor(colors, i, node, theme);
    // Canvas draws radius ≈ size * 2; Cosmos size is diameter-ish — keep proportional
    sizes[i] = Math.max(2, node.size * 2);
  }

  const resolved: Array<{
    sourceIndex: number;
    targetIndex: number;
    edge: GraphEdge;
    source: GraphNode;
    target: GraphNode;
  }> = [];

  for (const edge of edges) {
    const sourceId = edgeEndpointId(edge.source);
    const targetId = edgeEndpointId(edge.target);
    const sourceIndex = idToIndex.get(sourceId);
    const targetIndex = idToIndex.get(targetId);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    const source = indexToNode[sourceIndex];
    const target = indexToNode[targetIndex];
    if (!source || !target) continue;
    resolved.push({ sourceIndex, targetIndex, edge, source, target });
  }

  const links = new Float32Array(resolved.length * 2);
  const linkColors = new Float32Array(resolved.length * 4);
  const edgeMeta: CosmosEdgeMeta[] = [];

  for (let i = 0; i < resolved.length; i++) {
    const item = resolved[i];
    if (!item) continue;
    links[i * 2] = item.sourceIndex;
    links[i * 2 + 1] = item.targetIndex;

    const slot = EDGE_SLOT[item.edge.edgeType];
    writeRgba(linkColors, i * 4, colorToRgba(theme.edge.normalByType[slot]));

    edgeMeta.push({
      edgeType: item.edge.edgeType,
      sourceTitle: item.source.title,
      targetTitle: item.target.title,
      reason: item.edge.reason ?? null,
      score: item.edge.score,
      sourceIndex: item.sourceIndex,
      targetIndex: item.targetIndex,
    });
  }

  return {
    idToIndex,
    indexToId,
    indexToNode,
    edgeMeta,
    positions,
    colors,
    sizes,
    links,
    linkColors,
  };
}

/** Recolor existing buffers after a theme change (keeps indices / positions). */
export function recolorCosmosGraphBuffers(
  buffers: CosmosGraphBuffers,
  theme: GraphViewTheme,
): void {
  for (let i = 0; i < buffers.indexToNode.length; i++) {
    const node = buffers.indexToNode[i];
    if (!node) continue;
    paintNodeColor(buffers.colors, i, node, theme);
    buffers.sizes[i] = Math.max(2, node.size * 2);
  }
  for (let i = 0; i < buffers.edgeMeta.length; i++) {
    const meta = buffers.edgeMeta[i];
    if (!meta) continue;
    writeRgba(
      buffers.linkColors,
      i * 4,
      colorToRgba(theme.edge.normalByType[EDGE_SLOT[meta.edgeType]]),
    );
  }
}

/** Indices of nodes matching the active search set (for Cosmos highlight). */
export function searchMatchIndices(
  indexToId: readonly string[],
  searchMatchSet: Set<string>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < indexToId.length; i++) {
    const id = indexToId[i];
    if (id !== undefined && searchMatchSet.has(id)) out.push(i);
  }
  return out;
}
