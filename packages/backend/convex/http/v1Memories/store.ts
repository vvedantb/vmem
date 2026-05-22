import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  assertProfileAccess,
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

  if (isInstructionStoreBody(body)) {
    const result: StoreFromInstructionActionResult = await ctx.runAction(
      internal.neo4jActions.agent.storeFromInstructionInternal,
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

  return await ctx.runAction(
    internal.neo4jActions.memories.createMemoryInternal,
    {
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
    },
  );
}

export const storeMemory = withApiKeyAuth(
  "/api/v1/memories",
  "POST",
  storeBodySchema,
  runStoreHandler,
);
