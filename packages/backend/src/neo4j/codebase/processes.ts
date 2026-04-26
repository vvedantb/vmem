/**
 * Process detection. For each `EntryPoint`, BFS forward in the directed
 * `CALLS` graph (depth ≤ 8) to collect every reachable function. The
 * result is a `Process` node + edges (`STARTS_PROCESS`, `INCLUDES`)
 * stored separately from the structural relations array because the
 * Neo4j writer treats them as their own bucket.
 *
 * Depth limit is a guardrail against pathological cycles — we don't
 * trust ts-morph to be cycle-free in 100% of corner cases.
 */

import { type EntryPoint, type ProcessNode, type RelationEdge } from "./types";

const MAX_DEPTH = 8;

function buildAdjacency(calls: RelationEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const c of calls) {
    if (c.kind !== "CALLS") continue;
    let arr = adj.get(c.fromId);
    if (!arr) {
      arr = [];
      adj.set(c.fromId, arr);
    }
    arr.push(c.toId);
  }
  return adj;
}

function bfsFrom(
  start: string,
  adj: Map<string, string[]>,
  maxDepth: number,
): Set<string> {
  const visited = new Set<string>();
  const queue: Array<[string, number]> = [[start, 0]];
  visited.add(start);
  while (queue.length > 0) {
    const head = queue.shift();
    if (!head) break;
    const [id, depth] = head;
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
  const processes: ProcessNode[] = [];

  entryPoints.forEach((entry, idx) => {
    const members = bfsFrom(entry.functionId, adj, MAX_DEPTH);
    processes.push({
      id: `${codebaseId}:p${idx}`,
      name: entry.name,
      entryPointId: entry.functionId,
      entryKind: entry.kind,
      members: Array.from(members),
    });
  });

  return processes;
}
