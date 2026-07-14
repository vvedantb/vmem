import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { OpenRouterRequired } from "../../neo4jActions/agent/shared";
import type { UpdateFromInstructionResult } from "../../neo4jActions/agent/updateFromInstruction";
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
import { isOpenRouterRequired, openRouterRequiredResponse } from "./types";

async function runUpdateHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: UpdateBody,
): Promise<
  | Response
  | MemoryWithTags
  | null
  | UpdateFromInstructionResult
  | OpenRouterRequired
> {
  if (isInstructionUpdateBody(body)) {
    const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
    if (forbidden) {
      return forbidden;
    }

    const result = await ctx.runAction(
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

  const updated = await ctx.runAction(
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
