import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

type GraphData = Awaited<ReturnType<MemoryService["getGraphData"]>>;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { data: GraphData; expiresAt: number }>();

function getCached(key: string): GraphData | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function setCache(key: string, data: GraphData): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const graph = new Hono<{ Variables: { userId: string } }>();

graph.get("/", async (c) => {
  const userId = c.get("userId");
  const focus = c.req.query("focus");

  // Composite cache key: global graph vs local graph per focus node
  const cacheKey = focus ? `${userId}:${focus}` : userId;

  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`[graph] cache hit for ${cacheKey}${focus ? " (local)" : ""}`);
    return c.json(cached);
  }

  try {
    const service = getService();
    const t0 = performance.now();
    const data = focus
      ? await service.getLocalGraph(userId, focus)
      : await service.getGraphData(userId);
    const ms = (performance.now() - t0).toFixed(1);

    if (focus) {
      console.log(
        `[graph] local graph for ${focus} — ${ms}ms — ${data.nodes.length} nodes, ${data.relatesToEdges.length} relates_to, ${data.tagEdges.length} tag edges`,
      );
    } else {
      console.log(
        `[graph] neo4j query took ${ms}ms — ${data.nodes.length} nodes, ${data.relatesToEdges.length} relates_to, ${data.tagEdges.length} tag edges`,
      );
    }

    setCache(cacheKey, data);
    return c.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[graph] failed to fetch graph data:", err);
    return c.json(
      { error: "Failed to fetch graph data", detail: message },
      500,
    );
  }
});

export { graph };
