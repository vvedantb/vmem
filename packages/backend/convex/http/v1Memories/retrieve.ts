import { internal } from "../../_generated/api";
import { assertProfileAccess, withApiKeyAuth } from "./apiKeyAuth";
import { retrieveBodySchema } from "./schemas";

export const retrieveMemories = withApiKeyAuth(
  "/api/v1/memories/retrieve",
  "POST",
  retrieveBodySchema,
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
      internal.neo4jActions.memories.retrieveMemoriesInternal,
      {
        clerkId: auth.clerkId,
        profileId: body.profileId,
        query: body.query,
        type: body.type,
        tags: body.tags,
        limit: body.limit,
      },
    );
  },
);
