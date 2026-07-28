"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// day in milliseconds
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ContextPromptResponse {
  // markdown body to surface as the mcp resource
  content: string;
  // wall-clock ms when content was generated
  generatedAt: number;
  // true when the cache hadn't been built yet, caller may want to poll once for the populated version
  isPlaceholder: boolean;
}

const PLACEHOLDER = [
  "# vmem User Profile",
  "",
  "_Profile is being generated. Try again in a moment._",
].join("\n");

// read or trigger semantics for the cached profile prompt
async function getOrSchedule(
  ctx: ActionCtx,
  clerkId: string,
): Promise<ContextPromptResponse> {
  const cache = await ctx.runQuery(
    internal.contextPromptCache.getByClerkIdInternal,
    { clerkId },
  );

  // no cache row yet (first ever call), or cached content is older than maxAgeMs
  const generatedAt = cache?.generatedAt ?? 0;
  const isStale =
    !cache || generatedAt === 0 || Date.now() - generatedAt > MAX_AGE_MS;
  if (isStale) {
    await ctx.scheduler.runAfter(
      0,
      internal.contextPromptActions.regenerateContextPromptInternal,
      { clerkId },
    );
  }

  if (!cache || generatedAt === 0) {
    // either no cache yet, or the placeholder row, serve a placeholder so mcp clients always have valid markdown to render
    return {
      content: PLACEHOLDER,
      generatedAt: 0,
      isPlaceholder: true,
    };
  }

  return {
    content: cache.content,
    generatedAt,
    isPlaceholder: false,
  };
}

// mcp side action
export const mcpGetContextPrompt = internalAction({
  args: { clerkId: v.string() },
  returns: v.object({
    content: v.string(),
    generatedAt: v.number(),
    isPlaceholder: v.boolean(),
  }),
  handler: async (ctx, args): Promise<ContextPromptResponse> => {
    return await getOrSchedule(ctx, args.clerkId);
  },
});
