import type { GraphNode, ResolvedEdge } from "./types";

const CELL_SIZE = 60;

interface SpatialIndex {
  cells: Map<string, GraphNode[]>;
  lastHash: string;
  /** When false, rebuildIndex skips the O(n) hash computation entirely */
  dirty: boolean;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function hashNodes(nodes: GraphNode[]): string {
  let h = 0;
  for (const n of nodes) {
    const x = Math.round((n.x ?? 0) * 10);
    const y = Math.round((n.y ?? 0) * 10);
    h = ((h << 5) - h + x) | 0;
    h = ((h << 5) - h + y) | 0;
  }
  return String(h);
}

export function createSpatialIndex(): SpatialIndex {
  return { cells: new Map(), lastHash: "", dirty: true };
}

/** Mark the index as needing a rebuild on next rebuildIndex call */
export function markDirty(index: SpatialIndex): void {
  index.dirty = true;
}

export function rebuildIndex(index: SpatialIndex, nodes: GraphNode[]): void {
  if (!index.dirty) return;

  const hash = hashNodes(nodes);
  if (hash === index.lastHash) {
    index.dirty = false;
    return;
  }

  index.cells.clear();
  for (const node of nodes) {
    const cx = Math.floor((node.x ?? 0) / CELL_SIZE);
    const cy = Math.floor((node.y ?? 0) / CELL_SIZE);
    const key = cellKey(cx, cy);
    const cell = index.cells.get(key);
    if (cell) {
      cell.push(node);
    } else {
      index.cells.set(key, [node]);
    }
  }
  index.lastHash = hash;
  index.dirty = false;
}

/**
 * Naive O(E) edge hit-test. Edge counts are capped by data pipeline
 * (~≤4000 typical), so a spatial index isn't worth the maintenance cost here.
 */
export function getEdgeAt(
  edges: ResolvedEdge[],
  worldX: number,
  worldY: number,
  scale: number,
): number | null {
  const threshold = 6 / Math.min(scale, 1);
  const thrSq = threshold * threshold;
  let bestIdx = -1;
  let bestDSq = thrSq;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const x1 = e.source.x ?? 0;
    const y1 = e.source.y ?? 0;
    const x2 = e.target.x ?? 0;
    const y2 = e.target.y ?? 0;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((worldX - x1) * dx + (worldY - y1) * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * dx;
    const py = y1 + t * dy;
    const dSq = (worldX - px) ** 2 + (worldY - py) ** 2;
    if (dSq < bestDSq) {
      bestDSq = dSq;
      bestIdx = i;
    }
  }
  return bestIdx === -1 ? null : bestIdx;
}

export function getNodeAt(
  index: SpatialIndex,
  worldX: number,
  worldY: number,
  scale: number,
): GraphNode | null {
  const cx = Math.floor(worldX / CELL_SIZE);
  const cy = Math.floor(worldY / CELL_SIZE);

  let closest: GraphNode | null = null;
  let closestDist = Infinity;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = index.cells.get(cellKey(cx + dx, cy + dy));
      if (!cell) continue;
      for (const node of cell) {
        const nx = node.x ?? 0;
        const ny = node.y ?? 0;
        const hitRadius = (node.size * 2 + 6) / Math.min(scale, 1);
        const dist = Math.hypot(worldX - nx, worldY - ny);
        if (dist < hitRadius && dist < closestDist) {
          closest = node;
          closestDist = dist;
        }
      }
    }
  }

  return closest;
}
