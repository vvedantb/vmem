"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Day in milliseconds — used as the "max staleness" threshold below
 * which we serve the cached prompt without scheduling a regen. Memory
 * writes already trigger debounced invalidations, so this catches the
 * "user opened a fresh client a week later" case.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ContextPromptResponse {
  /** Markdown body to surface as the MCP resource. */
  content: string;
  /** Wall-clock ms when content was generated. 0 means placeholder. */
  generatedAt: number;
  /** True when the cache hadn't been built yet — caller may want to
   *  poll once for the populated version. */
  isPlaceholder: boolean;
}

const PLACEHOLDER = [
  "# vmem User Profile",
  "",
  "_Profile is being generated. Try again in a moment._",
].join("\n");

/**
 * Read-or-trigger semantics for the cached profile prompt. Always
 * returns immediately — never blocks on the LLM. If the cache is empty
 * or older than `MAX_AGE_MS`, schedules a fresh regeneration but still
 * returns whatever is there (or a placeholder on the very first call).
 *
 * MCP (JWT) callers go through `mcpGetContextPrompt`, which shares
 * `internal.contextPromptCache` helpers so cache invariants hold.
 */
async function getOrSchedule(
  ctx: ActionCtx,
  clerkId: string,
): Promise<ContextPromptResponse> {
  const cache = await ctx.runQuery(
    internal.contextPromptCache.getByClerkIdInternal,
    { clerkId },
  );

  // No cache row yet (first-ever call), or the cached content is older
  // than MAX_AGE_MS: schedule a refresh but don't block on it. The next
  // call (or the current MCP session's next read) gets the fresh content.
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
    // Either no cache yet, or the placeholder row — serve a placeholder
    // so MCP clients always have valid markdown to render.
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

/**
 * MCP-side action. The Convex MCP server (httpAction → "use node" action
 * pipeline) verifies the bearer JWT up front and passes the resolved
 * `clerkId` directly here — no per-action token verification.
 */
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
