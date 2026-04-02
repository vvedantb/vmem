import type { GraphNode } from "./types";

const CELL_SIZE = 200;

interface SpatialIndex {
  cells: Map<string, GraphNode[]>;
  lastHash: string;
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
  return { cells: new Map(), lastHash: "" };
}

export function rebuildIndex(index: SpatialIndex, nodes: GraphNode[]): void {
  const hash = hashNodes(nodes);
  if (hash === index.lastHash) return;

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
        const hitRadius = (node.size * 3 + 4) / Math.min(scale, 1);
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
