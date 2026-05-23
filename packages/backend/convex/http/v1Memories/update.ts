import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  assertProfileAccess,
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
    if (body.profileId) {
      const forbidden = await assertProfileAccess(
        ctx,
        auth.userId,
        body.profileId,
      );
      if (forbidden) {
        return forbidden;
      }
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
      return Response.json({ error: "openrouter_required" }, { status: 422 });
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
