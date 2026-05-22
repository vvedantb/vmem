import { internal } from "../../_generated/api";
import { withApiKeyAuth } from "./apiKeyAuth";
import { updateBodySchema } from "./schemas";

export const updateMemory = withApiKeyAuth(
  "/api/v1/memories",
  "PATCH",
  updateBodySchema,
  async (ctx, auth, body) => {
    return await ctx.runAction(
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
  },
);
