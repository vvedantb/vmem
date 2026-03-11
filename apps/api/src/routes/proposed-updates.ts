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

const proposedUpdates = new Hono();

proposedUpdates.get("/", async (c) => {
  const userId = c.req.query("userId");
  if (!userId) {
    return c.json({ error: "userId query param required" }, 400);
  }

  try {
    const service = getService();
    const proposals = await service.listProposedUpdates(userId);
    return c.json({ proposals });
  } catch (err) {
    console.error("Failed to list proposed updates:", err);
    return c.json({ error: "Failed to list proposed updates" }, 500);
  }
});

proposedUpdates.post("/:id/approve", async (c) => {
  try {
    const service = getService();
    const result = await service.resolveProposal(c.req.param("id"), "approve");
    if (!result) {
      return c.json({ error: "Proposal not found" }, 404);
    }
    return c.json(result);
  } catch (err) {
    console.error("Failed to approve proposal:", err);
    return c.json({ error: "Failed to approve proposal" }, 500);
  }
});

proposedUpdates.post("/:id/reject", async (c) => {
  try {
    const service = getService();
    const result = await service.resolveProposal(c.req.param("id"), "reject");
    if (!result) {
      return c.json({ error: "Proposal not found" }, 404);
    }
    return c.json(result);
  } catch (err) {
    console.error("Failed to reject proposal:", err);
    return c.json({ error: "Failed to reject proposal" }, 500);
  }
});

export { proposedUpdates };
