import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import {
  updateBodySchema,
  isInstructionUpdateBody,
  type UpdateBody,
} from "./schemas";
import {
  isOpenRouterRequired,
  openRouterRequiredResponse,
  type UpdateFromInstructionActionResult,
  type UpdateMemoryActionResult,
} from "./types";

async function runUpdateHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: UpdateBody,
): Promise<
  Response | UpdateMemoryActionResult | UpdateFromInstructionActionResult
> {
  if (isInstructionUpdateBody(body)) {
    const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
    if (forbidden) {
      return forbidden;
    }

    const result: UpdateFromInstructionActionResult = await ctx.runAction(
      internal.neo4jActions.agent.updateFromInstructionInternal,
      {
        clerkId: auth.clerkId,
        instruction: body.instruction,
        profileId: body.profileId,
      },
    );

    if (isOpenRouterRequired(result)) {
      return openRouterRequiredResponse();
    }

    return result;
  }

  const updated: UpdateMemoryActionResult = await ctx.runAction(
    internal.neo4jActions.memories.updateMemoryInternal,
    {
      clerkId: auth.clerkId,
      memoryId: body.memoryId,
      title: body.title,
      content: body.content,
      type: body.type,
      status: body.status,
      tags: body.tags,
      confidence: body.confidence,
      expiresAt: body.expiresAt,
    },
  );

  if (updated === null) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  return updated;
}

export const updateMemory = withApiKeyAuth(
  "/api/v1/memories",
  "PATCH",
  updateBodySchema,
  runUpdateHandler,
);
