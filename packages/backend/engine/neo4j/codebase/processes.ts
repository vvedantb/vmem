import type { EntryPoint, ProcessNode, RelationEdge } from "./types";

const MAX_DEPTH = 8;

function buildAdjacency(calls: RelationEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const c of calls) {
    if (c.kind !== "CALLS") continue;
    const arr = adj.get(c.fromId);
    if (arr) arr.push(c.toId);
    else adj.set(c.fromId, [c.toId]);
  }
  return adj;
}

function bfsFrom(
  start: string,
  adj: Map<string, string[]>,
  maxDepth: number,
): Set<string> {
  const visited = new Set<string>([start]);
  const queue: Array<[string, number]> = [[start, 0]];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (item === undefined) break;
    const [id, depth] = item;
    if (depth >= maxDepth) continue;
    const next = adj.get(id);
    if (!next) continue;
    for (const n of next) {
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push([n, depth + 1]);
    }
  }
  return visited;
}

export function detectProcesses(
  codebaseId: string,
  entryPoints: EntryPoint[],
  calls: RelationEdge[],
): ProcessNode[] {
  const adj = buildAdjacency(calls);
  return entryPoints.map((entry, idx) => ({
    id: `${codebaseId}:p${idx}`,
    name: entry.name,
    entryPointId: entry.functionId,
    entryKind: entry.kind,
    members: Array.from(bfsFrom(entry.functionId, adj, MAX_DEPTH)),
  }));
}
