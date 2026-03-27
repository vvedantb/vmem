import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

type GraphData = Awaited<ReturnType<MemoryService["getGraphData"]>>;

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { data: GraphData; expiresAt: number }>();

function getCached(userId: string): GraphData | undefined {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return undefined;
  }
  return entry.data;
}

function setCache(userId: string, data: GraphData): void {
  cache.set(userId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

const graph = new Hono<{ Variables: { userId: string } }>();

graph.get("/", async (c) => {
  const userId = c.get("userId");

  const cached = getCached(userId);
  if (cached) {
    console.log(`[graph] cache hit for ${userId}`);
    return c.json(cached);
  }

  try {
    const service = getService();
    const t0 = performance.now();
    const data = await service.getGraphData(userId);
    const ms = (performance.now() - t0).toFixed(1);
    console.log(
      `[graph] neo4j query took ${ms}ms — ${data.nodes.length} nodes, ${data.edges.length} edges`,
    );

    setCache(userId, data);
    return c.json(data);
  } catch (err) {
    console.error("[graph] failed to fetch graph data:", err);
    return c.json({ error: "Failed to fetch graph data" }, 500);
  }
});

export { graph };
