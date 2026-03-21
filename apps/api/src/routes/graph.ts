import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const graph = new Hono<{ Variables: { userId: string } }>();

graph.get("/", async (c) => {
  const userId = c.get("userId");
  const service = getService();
  const data = await service.getGraphData(userId);
  return c.json(data);
});

export { graph };
