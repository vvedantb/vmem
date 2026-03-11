import { Hono } from "hono";
import { z } from "zod/v4";
import { MemoryService } from "../db/memory-service.js";
import { getDriver } from "../db/neo4j.js";

const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

const createMemorySchema = z.object({
  userId: z.string(),
  title: z.string().min(1),
  content: z.string().min(1),
  type: memoryTypeSchema,
  source: z.string().min(1),
  tags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1.0),
  expiresAt: z.string().optional(),
});

const updateMemorySchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  type: memoryTypeSchema.optional(),
  status: memoryStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  expiresAt: z.string().nullable().optional(),
});

const searchSchema = z.object({
  query: z.string().optional(),
  type: memoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

const retrieveSchema = z.object({
  query: z.string().min(1),
  type: memoryTypeSchema.optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(50).default(5),
});

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const memories = new Hono();

memories.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = createMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const service = getService();
  const memory = await service.createMemory(parsed.data);
  return c.json(memory, 201);
});

memories.get("/", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const result = await service.listMemories({
    userId,
    type:
      (c.req.query("type") as "profile" | "episodic" | "knowledge") ??
      undefined,
    status:
      (c.req.query("status") as
        | "active"
        | "pinned"
        | "suppressed"
        | "expired") ?? undefined,
    limit: Number(c.req.query("limit") ?? "20"),
    offset: Number(c.req.query("offset") ?? "0"),
  });

  return c.json(result);
});

memories.get("/:id", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const memory = await service.getMemory(userId, c.req.param("id"));
  if (!memory) {
    return c.json({ error: "Memory not found" }, 404);
  }

  return c.json(memory);
});

memories.patch("/:id", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const body = await c.req.json();
  const parsed = updateMemorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const service = getService();
  const memory = await service.updateMemory(
    userId,
    c.req.param("id"),
    parsed.data,
  );
  if (!memory) {
    return c.json({ error: "Memory not found" }, 404);
  }

  return c.json(memory);
});

memories.delete("/:id", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const deleted = await service.deleteMemory(userId, c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Memory not found" }, 404);
  }

  return c.json({ status: "deleted" });
});

memories.post("/search", async (c) => {
  const body = await c.req.json();
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  if (!body.userId) {
    return c.json({ error: "userId required" }, 400);
  }

  const service = getService();
  const result = await service.searchMemories({
    ...parsed.data,
    userId: body.userId,
  });

  return c.json(result);
});

memories.post("/retrieve", async (c) => {
  const body = await c.req.json();
  const parsed = retrieveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  if (!body.userId) {
    return c.json({ error: "userId required" }, 400);
  }

  const service = getService();
  const candidates = await service.retrieveMemories({
    ...parsed.data,
    userId: body.userId,
  });

  return c.json({ memories: candidates });
});

memories.get("/:id/events", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const events = await service.getMemoryEvents(userId, c.req.param("id"));
  return c.json({ events });
});

export { memories };
