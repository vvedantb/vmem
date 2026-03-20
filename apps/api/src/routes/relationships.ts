import { Hono } from "hono";
import { z } from "zod/v4";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";
import { pushMemoryEvent } from "../lib/convex";

const linkSchema = z.object({
  memoryIdA: z.string().min(1),
  memoryIdB: z.string().min(1),
  reason: z.string().default("user linked"),
});

const unlinkSchema = z.object({
  memoryIdA: z.string().min(1),
  memoryIdB: z.string().min(1),
});

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const relationships = new Hono<{ Variables: { userId: string } }>();

relationships.post("/link", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const service = getService();
  const success = await service.linkMemories(
    userId,
    parsed.data.memoryIdA,
    parsed.data.memoryIdB,
    parsed.data.reason,
  );
  if (success) {
    pushMemoryEvent(userId, "relationship_created", parsed.data.memoryIdA, {
      source: parsed.data.memoryIdA,
      target: parsed.data.memoryIdB,
      reason: parsed.data.reason,
    });
  }
  return c.json({ success });
});

relationships.delete("/link", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();
  const parsed = unlinkSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const service = getService();
  const success = await service.unlinkMemories(
    userId,
    parsed.data.memoryIdA,
    parsed.data.memoryIdB,
  );
  if (success) {
    pushMemoryEvent(userId, "relationship_deleted", parsed.data.memoryIdA, {
      source: parsed.data.memoryIdA,
      target: parsed.data.memoryIdB,
    });
  }
  return c.json({ success });
});

relationships.get("/all", async (c) => {
  const userId = c.get("userId");
  const limitParam = c.req.query("limit");
  const parsed = limitParam ? parseInt(limitParam, 10) : 500;
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
  const service = getService();
  const results = await service.getAllRelationships(userId, limit);
  return c.json({ data: results });
});

relationships.get("/memory/:id", async (c) => {
  const userId = c.get("userId");
  const service = getService();
  const results = await service.getRelatedMemories(userId, c.req.param("id"));
  return c.json({ data: results });
});

export { relationships };
