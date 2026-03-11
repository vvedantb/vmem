import { Hono } from "hono";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const proposedUpdates = new Hono();

proposedUpdates.get("/", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const proposals = await service.listProposedUpdates(userId);
  return c.json({ proposals });
});

proposedUpdates.post("/:id/approve", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const result = await service.resolveProposal(
    c.req.param("id"),
    "approve",
    userId,
  );
  if (!result) {
    return c.json({ error: "Proposal not found" }, 404);
  }
  return c.json(result);
});

proposedUpdates.post("/:id/reject", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  const service = getService();
  const result = await service.resolveProposal(
    c.req.param("id"),
    "reject",
    userId,
  );
  if (!result) {
    return c.json({ error: "Proposal not found" }, 404);
  }
  return c.json(result);
});

export { proposedUpdates };
