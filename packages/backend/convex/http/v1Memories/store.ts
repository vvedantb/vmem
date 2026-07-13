import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import {
  storeBodySchema,
  isInstructionStoreBody,
  type StoreBody,
} from "./schemas";
import {
  isOpenRouterRequired,
  openRouterRequiredResponse,
  type CreateMemoryActionResult,
  type StoreFromInstructionActionResult,
} from "./types";

async function runStoreHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: StoreBody,
): Promise<
  Response | CreateMemoryActionResult | StoreFromInstructionActionResult
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
    tags: body.tags,
    confidence: body.confidence,
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
