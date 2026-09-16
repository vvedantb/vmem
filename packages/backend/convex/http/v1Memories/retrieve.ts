import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { retrieveBodySchema, type RetrieveBody } from "@vmem/sdk";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import type { RetrieveHttpResult } from "./types";
import {
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
  summarizeRetrievedMemories,
} from "../../memoryRuntime";
import { getProfileKind } from "../../memoryScope";

async function runRetrieveHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: RetrieveBody,
): Promise<Response | RetrieveHttpResult> {
  const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
  if (forbidden) {
    return forbidden;
  }

  const graphScope = await getProfileKind(ctx, body.profileId);
  const memories =
    graphScope === "team" && body.profileId !== undefined
      ? await retrieveMemoriesForTeamProfile(ctx, {
          clerkId: auth.clerkId,
          profileId: body.profileId,
          query: body.query,
          type: body.type,
          tags: body.tags,
          limit: body.limit ?? 10,
        })
      : await retrieveMemoriesForClerk(ctx, {
          clerkId: auth.clerkId,
          profileId: body.profileId,
          query: body.query,
          type: body.type,
          tags: body.tags,
          limit: body.limit ?? 10,
        });

  const userContext = await ctx.runQuery(
    internal.userSettings.getUserContextInternal,
    {
      userId: auth.userId,
    },
  );

  if (!body.summarize) {
    return { memories, userContext };
  }

  return {
    memories,
    userContext,
    summary: summarizeRetrievedMemories(memories),
  };
}

export const retrieveMemories = withApiKeyAuth(
  "/api/v1/memories/retrieve",
  "POST",
  retrieveBodySchema,
  runRetrieveHandler,
);
