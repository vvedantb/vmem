import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  buildEntityExtractionPrompt,
  parseEntityExtractionResponse,
} from "../engine/memory/entities";
import { resolveOpenRouterAuth } from "./lib/openRouterKey";
import { callJsonChat } from "./lib/openRouter/jsonChat";

export const extractMemoryEntitiesInternal = internalAction({
  args: {
    clerkId: v.string(),
    memoryId: v.string(),
    profileId: v.optional(v.string()),
    updatedAt: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const memory = await ctx.runQuery(
      internal.memoryStore.functions.getMemoryInternal,
      { userId: args.clerkId, memoryId: args.memoryId },
    );
    if (!memory || memory.updatedAt !== args.updatedAt) return false;

    const openRouter = await resolveOpenRouterAuth(ctx, args.clerkId);
    if (!openRouter) return false;

    const [known, candidates] = await Promise.all([
      ctx.runQuery(internal.memoryStore.functions.listKnownEntitiesInternal, {
        userId: args.clerkId,
      }),
      ctx.runQuery(
        internal.memoryStore.functions.listRecentMemoryCandidatesInternal,
        {
          userId: args.clerkId,
          profileId: args.profileId ?? memory.profileId ?? undefined,
          excludeMemoryId: memory.id,
        },
      ),
    ]);

    const raw = await callJsonChat(ctx, {
      apiKey: openRouter.apiKey,
      userId: openRouter.userId,
      profileId: args.profileId ?? memory.profileId ?? undefined,
      feature: "enrichment",
      prompt: buildEntityExtractionPrompt(
        memory.title,
        memory.content,
        candidates,
        known,
      ),
    });
    if (!raw) return false;
    const parsed = parseEntityExtractionResponse(raw);
    if (!parsed) return false;

    const written = await ctx.runMutation(
      internal.memoryStore.functions.applyLlmEntityExtractionInternal,
      {
        userId: args.clerkId,
        memoryId: args.memoryId,
        entities: parsed.entities,
        relatedMemoryIds: parsed.relatedMemoryIds,
      },
    );
    return written > 0;
  },
});
