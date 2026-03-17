import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const dashboard = new Hono<{ Variables: { userId: string } }>();

dashboard.get("/stats", async (c) => {
  const userId = c.get("userId");
  const service = getService();
  const stats = await service.getStats(userId);
  return c.json({ data: stats });
});

dashboard.get("/activity", async (c) => {
  const userId = c.get("userId");
  const service = getService();
  const activity = await service.getRecentActivity(userId);
  return c.json({ data: activity });
});

export { dashboard };
