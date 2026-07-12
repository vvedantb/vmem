/**
 * Synthetic graph generator for the `?bench=N` performance mode.
 *
 * Builds a deterministic, realistically-shaped dataset entirely client-side
 * (no server fetch) so graph rendering/simulation performance can be verified
 * at scales far beyond the account's real data — e.g. /memories/graph?bench=100000.
 *
 * Shape mirrors real data: clustered RELATES_TO structure (hub + chain per
 * cluster with occasional long-range links), a bounded tag vocabulary so the
 * color-bucketing matches production cardinality, and a capped number of tag
 * edges (the server caps these at 5000 too).
 */
import type { ApiGraphNode, ApiRelatesToEdge, ApiTagEdge } from "./graph-data";

export interface BenchGraph {
  nodes: ApiGraphNode[];
  relatesToEdges: ApiRelatesToEdge[];
  tagEdges: ApiTagEdge[];
}

/** Hard ceiling so a hand-typed `?bench=99999999` can't OOM the tab. */
const BENCH_MAX_NODES = 200_000;
const CLUSTER_SIZE = 50;
const TAG_POOL_SIZE = 48;
const TAG_EDGE_CAP = 5000;

/** Deterministic LCG so every bench run renders the identical graph. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function generateBenchGraph(count: number): BenchGraph {
  const n = Math.min(Math.max(1, Math.trunc(count)), BENCH_MAX_NODES);
  const rng = makeRng(42);

  const tags: string[] = [];
  for (let i = 0; i < TAG_POOL_SIZE; i++) tags.push(`bench-topic-${i}`);

  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;

  const nodes = Array.from<ApiGraphNode>({ length: n });
  for (let i = 0; i < n; i++) {
    const primaryTag = tags[i % TAG_POOL_SIZE];
    const nodeTags =
      rng() < 0.4
        ? [primaryTag, tags[Math.floor(rng() * TAG_POOL_SIZE)]]
        : [primaryTag];
    nodes[i] = {
      id: `bench-${i}`,
      title: `Bench memory ${i}`,
      tags: nodeTags,
      createdAt: new Date(now - Math.floor(rng() * yearMs)).toISOString(),
      kind: "memory",
      source: "bench",
      sourceType: null,
      type: "knowledge",
    };
  }

  // Cluster structure: each cluster is a chain anchored to a hub, plus ~10%
  // long-range links so the layout has both local clumps and global bridges.
  const relatesToEdges: ApiRelatesToEdge[] = [];
  for (let i = 1; i < n; i++) {
    const clusterStart = i - (i % CLUSTER_SIZE);
    if (i !== clusterStart) {
      relatesToEdges.push({
        source: `bench-${i}`,
        target: `bench-${i - 1}`,
        reason: "bench chain",
      });
      if (i % 10 === 0) {
        relatesToEdges.push({
          source: `bench-${i}`,
          target: `bench-${clusterStart}`,
          reason: "bench hub",
        });
      }
    } else {
      relatesToEdges.push({
        source: `bench-${i}`,
        target: `bench-${Math.floor(rng() * i)}`,
        reason: "bench bridge",
      });
    }
  }

  const tagEdges: ApiTagEdge[] = [];
  const tagEdgeCount = Math.min(TAG_EDGE_CAP, Math.floor(n / 2));
  for (let i = 0; i < tagEdgeCount; i++) {
    const a = Math.floor(rng() * n);
    const b = Math.floor(rng() * n);
    if (a === b) continue;
    tagEdges.push({
      source: `bench-${Math.min(a, b)}`,
      target: `bench-${Math.max(a, b)}`,
      weight: 2,
      sharedTags: [tags[i % TAG_POOL_SIZE]],
    });
  }

  return { nodes, relatesToEdges, tagEdges };
}
