import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { retrieveBodySchema, type RetrieveBody } from "@vmem/sdk";
import {
  guardProfileAccess,
  withApiKeyAuth,
  type ApiKeyAuth,
} from "./apiKeyAuth";
import {
  isOpenRouterRequired,
  openRouterRequiredResponse,
  type RetrieveHttpResult,
} from "./types";

async function runRetrieveHandler(
  ctx: ActionCtx,
  auth: ApiKeyAuth,
  body: RetrieveBody,
): Promise<Response | RetrieveHttpResult> {
  const forbidden = await guardProfileAccess(ctx, auth, body.profileId);
  if (forbidden) {
    return forbidden;
  }

  const retrieveArgs = {
    clerkId: auth.clerkId,
    query: body.query,
    type: body.type,
    tags: body.tags,
    limit: body.limit ?? 10,
  };

  // a team profile retrieves across every member's memories in it. access is already asserted above, so the profile id alone is the scope.
  const graphScope =
    body.profileId === undefined
      ? "personal"
      : await ctx.runQuery(internal.profiles.getProfileScopeInternal, {
          profileId: body.profileId,
        });

  const memories =
    graphScope === "team" && body.profileId !== undefined
      ? await ctx.runAction(
          internal.neo4jActions.memories.retrieveMemoriesForTeamInternal,
          { ...retrieveArgs, profileId: body.profileId },
        )
      : await ctx.runAction(
          internal.neo4jActions.memories.retrieveMemoriesInternal,
          { ...retrieveArgs, profileId: body.profileId },
        );

  const userContext = await ctx.runQuery(
    internal.userSettings.getUserContextInternal,
    {
      userId: auth.userId,
    },
  );

  if (!body.summarize) {
    return { memories, userContext };
  }

  const summaryResult = await ctx.runAction(
    internal.neo4jActions.agent.summarizeRetrieveInternal,
    {
      clerkId: auth.clerkId,
      profileId: body.profileId,
      query: body.query,
      memories: memories.map((memory) => ({
        id: memory.id,
        title: memory.title,
        content: memory.content,
      })),
    },
  );

  if (isOpenRouterRequired(summaryResult)) {
    return openRouterRequiredResponse();
  }

  return {
    memories,
    userContext,
    summary: summaryResult.summary,
  };
}

export const retrieveMemories = withApiKeyAuth(
  "/api/v1/memories/retrieve",
  "POST",
  retrieveBodySchema,
  runRetrieveHandler,
);
