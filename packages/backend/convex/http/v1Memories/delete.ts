import type { ActionCtx } from "../../_generated/server";
import { deleteBodySchema, type DeleteBody } from "@vmem/sdk";
import { withApiKeyAuth, type ApiKeyAuth } from "./apiKeyAuth";
import { deleteMemoryForClerk } from "../../memoryRuntime";

async function runDeleteHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: DeleteBody,
): Promise<Response | { deleted: true }> {
  const deleted = await deleteMemoryForClerk(ctx, auth.clerkId, body.id);

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
