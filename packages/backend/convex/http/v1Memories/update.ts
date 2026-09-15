import type { ActionCtx } from "../../_generated/server";
import {
  isInstructionUpdateBody,
  updateBodySchema,
  type MemoryWithTags,
  type UpdateBody,
} from "@vmem/sdk";
import {
  storeMemoryFromInstruction,
  updateMemoryForClerk,
} from "../../memoryRuntime";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";

async function runUpdateHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: UpdateBody,
): Promise<
  | Response
  | MemoryWithTags
  | null
  | { created: MemoryWithTags[]; summary: string }
> {
  if (isInstructionUpdateBody(body)) {
    const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
    if (forbidden) {
      return forbidden;
    }

    return storeMemoryFromInstruction(ctx, {
      clerkId: auth.clerkId,
      instruction: body.instruction,
      profileId: body.profileId,
    });
  }

  const updated = await updateMemoryForClerk(ctx, {
    clerkId: auth.clerkId,
    memoryId: body.id,
    title: body.title,
    content: body.content,
    type: body.type,
    status: body.status,
    tags: body.tags,
    confidence: body.confidence,
    expiresAt: body.expiresAt,
  });

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
