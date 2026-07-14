import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { deleteBodySchema, type DeleteBody } from "../../memoryApi/contract";
import { withApiKeyAuth, type ApiKeyAuth } from "./apiKeyAuth";

async function runDeleteHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: DeleteBody,
): Promise<Response | { deleted: true }> {
  const deleted = await ctx.runAction(
    internal.neo4jActions.memories.deleteMemoryInternal,
    {
      clerkId: auth.clerkId,
      memoryId: body.id,
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
