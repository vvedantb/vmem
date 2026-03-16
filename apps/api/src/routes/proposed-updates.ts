import { Hono } from "hono";
import { z } from "zod/v4";
import { MemoryService } from "../db/memory-service";
import { getDriver } from "../db/neo4j";

const resolveSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

function getService(): MemoryService {
  return new MemoryService(getDriver());
}

const proposedUpdates = new Hono<{ Variables: { userId: string } }>();

proposedUpdates.get("/", async (c) => {
  const userId = c.get("userId");
  const service = getService();
  const proposals = await service.listProposedUpdates(userId);
  return c.json({ proposals });
});

proposedUpdates.post("/:id/approve", async (c) => {
  const service = getService();
  const result = await service.resolveProposal(c.req.param("id"), "approve");
  if (!result) {
    return c.json({ error: "Proposal not found" }, 404);
  }
  return c.json(result);
});

proposedUpdates.post("/:id/reject", async (c) => {
  const service = getService();
  const result = await service.resolveProposal(c.req.param("id"), "reject");
  if (!result) {
    return c.json({ error: "Proposal not found" }, 404);
  }
  return c.json(result);
});

export { proposedUpdates };
