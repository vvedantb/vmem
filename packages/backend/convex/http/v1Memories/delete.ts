import { z } from "zod";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { withApiKeyAuth, type ApiKeyAuth } from "./apiKeyAuth";

const deleteBodySchema = z.object({
  memoryId: z.string(),
});

type DeleteBody = z.infer<typeof deleteBodySchema>;

async function runDeleteHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: DeleteBody,
): Promise<Response | { deleted: true }> {
  const deleted = await ctx.runAction(
    internal.neo4jActions.memories.deleteMemoryInternal,
    {
      clerkId: auth.clerkId,
      memoryId: body.memoryId,
    },
  );

  if (!deleted) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return { deleted: true };
}

export const deleteMemory = withApiKeyAuth(
  "/api/v1/memories",
  "DELETE",
  deleteBodySchema,
  runDeleteHandler,
);
