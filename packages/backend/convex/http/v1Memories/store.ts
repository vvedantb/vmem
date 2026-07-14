import type { MemoryWithTags } from "../../../engine/neo4j/memory/types";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  isInstructionStoreBody,
  storeBodySchema,
  type StoreBody,
} from "../../memoryApi/contract";
import type { OpenRouterRequired } from "../../neo4jActions/agent/shared";
import type { StoreFromInstructionResult } from "../../neo4jActions/agent/storeFromInstruction";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import { isOpenRouterRequired, openRouterRequiredResponse } from "./types";

async function runStoreHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: StoreBody,
): Promise<
  Response | MemoryWithTags | StoreFromInstructionResult | OpenRouterRequired
> {
  const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
  if (forbidden) {
    return forbidden;
  }

  if (isInstructionStoreBody(body)) {
    const result = await ctx.runAction(
      internal.neo4jActions.agent.storeFromInstructionInternal,
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

  return ctx.runAction(internal.neo4jActions.memories.createMemoryInternal, {
    clerkId: auth.clerkId,
    profileId: body.profileId,
    title: body.title,
    content: body.content,
    type: body.type,
    source: body.source,
    tags: body.tags ?? [],
    confidence: body.confidence ?? 1,
    expiresAt: body.expiresAt,
    url: body.url,
    externalId: body.externalId,
    sourceType: body.sourceType,
  });
}

export const storeMemory = withApiKeyAuth(
  "/api/v1/memories",
  "POST",
  storeBodySchema,
  runStoreHandler,
);
