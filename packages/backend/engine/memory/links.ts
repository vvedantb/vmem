export interface MemoryLinkEdge {
  sourceId: string;
  targetId: string;
  reason: string;
}

export interface GraphNeighborHit {
  id: string;
  hops: number;
  seedId: string;
  seedTitle: string;
  reason: string;
}

function pushNeighbor(
  map: Map<string, Array<{ id: string; reason: string }>>,
  from: string,
  to: string,
  reason: string,
): void {
  const existing = map.get(from);
  if (existing) {
    existing.push({ id: to, reason });
    return;
  }
  map.set(from, [{ id: to, reason }]);
}

export function adjacencyFromLinks(
  links: readonly MemoryLinkEdge[],
): Map<string, Array<{ id: string; reason: string }>> {
  const map = new Map<string, Array<{ id: string; reason: string }>>();
  for (const link of links) {
    pushNeighbor(map, link.sourceId, link.targetId, link.reason);
    pushNeighbor(map, link.targetId, link.sourceId, link.reason);
  }
  return map;
}

export function expandGraphNeighbors(
  seedIds: readonly string[],
  seedTitleById: ReadonlyMap<string, string>,
  links: readonly MemoryLinkEdge[],
  limit: number,
  maxHops: number = 1,
): GraphNeighborHit[] {
  if (
    seedIds.length === 0 ||
    links.length === 0 ||
    limit <= 0 ||
    maxHops <= 0
  ) {
    return [];
  }
  const adjacency = adjacencyFromLinks(links);
  const seen = new Set(seedIds);
  const hits: GraphNeighborHit[] = [];
  let frontier: GraphNeighborHit[] = [];
  for (const seedId of seedIds) {
    const neighbors = adjacency.get(seedId) ?? [];
    for (const neighbor of neighbors) {
      if (seen.has(neighbor.id)) continue;
      seen.add(neighbor.id);
      const hit: GraphNeighborHit = {
        id: neighbor.id,
        hops: 1,
        seedId,
        seedTitle: seedTitleById.get(seedId) ?? seedId,
        reason: neighbor.reason,
      };
      hits.push(hit);
      frontier.push(hit);
      if (hits.length >= limit) return hits;
    }
  }
  for (let hop = 2; hop <= maxHops; hop += 1) {
    const next: GraphNeighborHit[] = [];
    for (const parent of frontier) {
      const neighbors = adjacency.get(parent.id) ?? [];
      for (const neighbor of neighbors) {
        if (seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        const hit: GraphNeighborHit = {
          id: neighbor.id,
          hops: hop,
          seedId: parent.seedId,
          seedTitle: parent.seedTitle,
          reason: neighbor.reason,
        };
        hits.push(hit);
        next.push(hit);
        if (hits.length >= limit) return hits;
      }
    }
    frontier = next;
  }
  return hits;
}
