import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const timeline = new Hono<{ Variables: { userId: string } }>();

timeline.get("/memory/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const service = getService();
  const events = await service.getMemoryTimeline(userId, id);
  return c.json({ data: events });
});

timeline.get("/topic", async (c) => {
  const userId = c.get("userId");
  const tag = c.req.query("tag");
  if (!tag) {
    return c.json({ error: "tag query parameter is required" }, 400);
  }
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  const service = getService();
  const events = await service.getTopicTimeline(userId, tag, limit, offset);
  return c.json({ data: events });
});

timeline.get("/search", async (c) => {
  const userId = c.get("userId");
  const q = c.req.query("q");
  if (!q) {
    return c.json({ error: "q query parameter is required" }, 400);
  }
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");
  const service = getService();
  const events = await service.getSearchTimeline(userId, q, limit, offset);
  return c.json({ data: events });
});

export { timeline };
