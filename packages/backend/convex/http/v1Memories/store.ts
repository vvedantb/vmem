import { internal } from "../../_generated/api";
import { assertProfileAccess, withApiKeyAuth } from "./apiKeyAuth";
import { storeBodySchema } from "./schemas";

export const storeMemory = withApiKeyAuth(
  "/api/v1/memories",
  "POST",
  storeBodySchema,
  async (ctx, auth, body) => {
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
  },
);
