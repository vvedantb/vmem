import type { MemoryWithTags } from "@vmem/sdk";
import { computeContentHash } from "./hash";
import { isVisibleStatus } from "./scope";
import { textJaccard } from "./supersede";

const MERGE_JACCARD = 0.75;

export interface MemoryCluster {
  memories: MemoryWithTags[];
  score: number;
}

function parentOf(parents: number[], index: number): number {
  let current = index;
  while (parents[current] !== current) {
    const parent = parents[current];
    if (parent === undefined) return current;
    const grand = parents[parent];
    if (grand !== undefined) parents[current] = grand;
    current = parents[current] ?? current;
  }
  return current;
}

function union(parents: number[], a: number, b: number): void {
  const rootA = parentOf(parents, a);
  const rootB = parentOf(parents, b);
  if (rootA !== rootB) parents[rootB] = rootA;
}

function fingerprint(memory: MemoryWithTags): string {
  return computeContentHash(memory.title, memory.content);
}

function clusterScore(group: readonly MemoryWithTags[]): number {
  if (group.length < 2) return 1;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < group.length; i += 1) {
    const left = group[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < group.length; j += 1) {
      const right = group[j];
      if (right === undefined) continue;
      const sameHash = fingerprint(left) === fingerprint(right);
      total += sameHash ? 1 : textJaccard(left, right);
      pairs += 1;
    }
  }
  return pairs === 0 ? 1 : total / pairs;
}

export function clusterNearDuplicateMemories(
  memories: readonly MemoryWithTags[],
  options?: { jaccard?: number; limit?: number },
): MemoryCluster[] {
  const threshold = options?.jaccard ?? MERGE_JACCARD;
  const visible = memories.filter((memory) => isVisibleStatus(memory.status));
  if (visible.length < 2) return [];

  const parents = visible.map((_, index) => index);
  for (let i = 0; i < visible.length; i += 1) {
    const left = visible[i];
    if (left === undefined) continue;
    const leftHash = fingerprint(left);
    for (let j = i + 1; j < visible.length; j += 1) {
      const right = visible[j];
      if (right === undefined) continue;
      const sameHash = leftHash === fingerprint(right);
      if (!sameHash && textJaccard(left, right) < threshold) continue;
      union(parents, i, j);
    }
  }

  const groups = new Map<number, MemoryWithTags[]>();
  for (let i = 0; i < visible.length; i += 1) {
    const memory = visible[i];
    if (memory === undefined) continue;
    const root = parentOf(parents, i);
    const group = groups.get(root);
    if (group) group.push(memory);
    else groups.set(root, [memory]);
  }

  const clusters: MemoryCluster[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    clusters.push({ memories: group, score: clusterScore(group) });
  }

  clusters.sort(
    (a, b) => b.score - a.score || b.memories.length - a.memories.length,
  );
  const limit = options?.limit;
  return limit === undefined ? clusters : clusters.slice(0, Math.max(0, limit));
}

export function pickClusterKeeper(
  memories: readonly MemoryWithTags[],
): MemoryWithTags {
  const ranked = [...memories].sort((a, b) => {
    const contentDelta = b.content.length - a.content.length;
    if (contentDelta !== 0) return contentDelta;
    const updatedDelta = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    if (updatedDelta !== 0) return updatedDelta;
    return a.id.localeCompare(b.id);
  });
  const keeper = ranked[0];
  if (keeper === undefined) {
    throw new Error("pickClusterKeeper requires at least one memory");
  }
  return keeper;
}
