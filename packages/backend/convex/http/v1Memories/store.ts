import type { ActionCtx } from "../../_generated/server";
import {
  isInstructionStoreBody,
  storeBodySchema,
  type MemoryWithTags,
  type StoreBody,
} from "@vmem/sdk";
import {
  createMemoryForClerk,
  storeMemoryFromInstruction,
} from "../../memoryRuntime";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";

async function runStoreHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: StoreBody,
): Promise<
  Response | MemoryWithTags | { created: MemoryWithTags[]; summary: string }
> {
  const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
  if (forbidden) {
    return forbidden;
  }

  if (isInstructionStoreBody(body)) {
    return storeMemoryFromInstruction(ctx, {
      clerkId: auth.clerkId,
      instruction: body.instruction,
      profileId: body.profileId,
    });
  }

  return createMemoryForClerk(ctx, {
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
