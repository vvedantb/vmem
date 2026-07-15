import type { EntryPoint, ProcessNode, RelationEdge } from "./types";

const MAX_DEPTH = 8;

export function detectProcesses(
  codebaseId: string,
  entryPoints: EntryPoint[],
  calls: RelationEdge[],
): ProcessNode[] {
  const adj = new Map<string, string[]>();
  for (const c of calls) {
    if (c.kind !== "CALLS") continue;
    const next = adj.get(c.fromId);
    if (next) next.push(c.toId);
    else adj.set(c.fromId, [c.toId]);
  }

  return entryPoints.map((entry, idx) => ({
    id: `${codebaseId}:p${idx}`,
    name: entry.name,
    entryPointId: entry.functionId,
    entryKind: entry.kind,
    members: bfsFrom(entry.functionId, adj, MAX_DEPTH),
  }));
}

function bfsFrom(
  start: string,
  adj: Map<string, string[]>,
  maxDepth: number,
): string[] {
  const visited = new Set<string>([start]);
  const queue: Array<[string, number]> = [[start, 0]];
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    if (item === undefined) break;
    const [id, depth] = item;
    if (depth >= maxDepth) continue;
    for (const n of adj.get(id) ?? []) {
      if (visited.has(n)) continue;
      visited.add(n);
      queue.push([n, depth + 1]);
    }
  }
  return [...visited];
}
