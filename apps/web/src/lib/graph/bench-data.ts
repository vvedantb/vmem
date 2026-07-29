// synthetic graph for `?bench=n` client perf testing
// deterministic (seed 42) so runs are comparable
import type { ApiGraphNode, ApiRelatesToEdge, ApiTagEdge } from "./graph-data";

const BENCH_MAX_NODES = 200_000;
const CLUSTER_SIZE = 50;
const TAG_POOL_SIZE = 48;
const TAG_EDGE_CAP = 5_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RNG_SEED = 42;

type BenchGraph = {
  nodes: ApiGraphNode[];
  relatesToEdges: ApiRelatesToEdge[];
  tagEdges: ApiTagEdge[];
};

// mulberry, style lcg, same sequence every run for a given seed
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function clampNodeCount(count: number): number {
  return Math.min(Math.max(1, Math.trunc(count)), BENCH_MAX_NODES);
}

function buildTagPool(): string[] {
  return Array.from({ length: TAG_POOL_SIZE }, (_, i) => `bench-topic-${i}`);
}

function buildNodes(
  count: number,
  tags: string[],
  rng: () => number,
): ApiGraphNode[] {
  const now = Date.now();

  return Array.from({ length: count }, (_, i) => {
    const primaryTag =
      tags[i % TAG_POOL_SIZE] ?? `bench-topic-${i % TAG_POOL_SIZE}`;
    const secondaryTag = tags[Math.floor(rng() * TAG_POOL_SIZE)];
    const nodeTags =
      rng() < 0.4 && secondaryTag !== undefined
        ? [primaryTag, secondaryTag]
        : [primaryTag];

    return {
      id: `bench-${i}`,
      title: `Bench memory ${i}`,
      tags: nodeTags,
      createdAt: new Date(now - Math.floor(rng() * YEAR_MS)).toISOString(),
      kind: "memory",
      source: "bench",
      sourceType: null,
      type: "knowledge",
    };
  });
}

// clusters of size cluster_size chain + hub links, with long, range bridges
// when a new cluster starts
function buildRelatesToEdges(
  count: number,
  rng: () => number,
): ApiRelatesToEdge[] {
  const edges: ApiRelatesToEdge[] = [];

  for (let i = 1; i < count; i++) {
    const clusterStart = i - (i % CLUSTER_SIZE);
    const id = `bench-${i}`;

    if (i === clusterStart) {
      edges.push({
        source: id,
        target: `bench-${Math.floor(rng() * i)}`,
        reason: "bench bridge",
      });
      continue;
    }

    edges.push({
      source: id,
      target: `bench-${i - 1}`,
      reason: "bench chain",
    });

    if (i % 10 === 0) {
      edges.push({
        source: id,
        target: `bench-${clusterStart}`,
        reason: "bench hub",
      });
    }
  }

  return edges;
}

function buildTagEdges(
  count: number,
  tags: string[],
  rng: () => number,
): ApiTagEdge[] {
  const edges: ApiTagEdge[] = [];
  const edgeCount = Math.min(TAG_EDGE_CAP, Math.floor(count / 2));

  for (let i = 0; i < edgeCount; i++) {
    const a = Math.floor(rng() * count);
    const b = Math.floor(rng() * count);
    if (a === b) continue;

    const sharedTag = tags[i % TAG_POOL_SIZE];
    if (sharedTag === undefined) continue;

    edges.push({
      source: `bench-${Math.min(a, b)}`,
      target: `bench-${Math.max(a, b)}`,
      weight: 2,
      sharedTags: [sharedTag],
    });
  }

  return edges;
}

export function generateBenchGraph(count: number): BenchGraph {
  const nodeCount = clampNodeCount(count);
  const rng = createRng(RNG_SEED);
  const tags = buildTagPool();

  return {
    nodes: buildNodes(nodeCount, tags, rng),
    relatesToEdges: buildRelatesToEdges(nodeCount, rng),
    tagEdges: buildTagEdges(nodeCount, tags, rng),
  };
}
