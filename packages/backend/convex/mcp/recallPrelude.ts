import { v } from "convex/values";
import { getUserByClerkId } from "../auth";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { readContextPromptCache } from "../contextPromptCache";
import {
  mcpScopeValidator,
  resolveProfileIdForMcpScope,
  type McpScope,
} from "../profiles/mcpAccess";
import { readQueryEmbeddingCache } from "../queryEmbeddingCache";
import {
  listEffectiveSkillsForMcp,
  toSkillIndexEntry,
  type SkillIndexSlice,
} from "../skills";

// Everything recall_context reads before it searches, in one round trip:
// the profile to recall from, the skill index, the cached context prompt,
// and the query-embedding cache row plus the user id the embedding call
// needs. Separate runQuery calls from the action cost a round trip each and
// queued behind each other and the text search.

// skills and profile are extras: a failure drops the section, not the recall
async function recallSkillIndex(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
): Promise<SkillIndexSlice[]> {
  try {
    const rows = await listEffectiveSkillsForMcp(ctx, clerkId, scope);
    return rows.map(toSkillIndexEntry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][recall_context] skills failed:", message);
    return [];
  }
}

// cached context prompt only: never schedules a regeneration, so a per-turn
// call adds no LLM work
async function recallProfile(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope,
): Promise<string | null> {
  if (scope === "team") return null;
  try {
    const cache = await readContextPromptCache(ctx, clerkId);
    return cache === null || cache.generatedAt === 0 ? null : cache.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][recall_context] profile failed:", message);
    return null;
  }
}

export const getInternal = internalQuery({
  args: {
    clerkId: v.string(),
    scope: mcpScopeValidator,
    profileId: v.optional(v.string()),
    // absent when retrieve would not cache (no API key)
    embeddingKey: v.optional(v.string()),
  },
  returns: v.object({
    profileId: v.string(),
    skills: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        updatedAt: v.optional(v.number()),
      }),
    ),
    profile: v.union(v.string(), v.null()),
    embeddingHit: v.union(
      v.object({ embedding: v.array(v.float64()), expiresAt: v.number() }),
      v.null(),
    ),
    userId: v.union(v.id("users"), v.null()),
  }),
  // expiry of embeddingHit is checked by the caller, so this stays cacheable
  handler: async (ctx, args) => {
    const embeddingKey = args.embeddingKey;
    const [profileId, skills, profile, embeddingHit, user] = await Promise.all([
      resolveProfileIdForMcpScope(
        ctx,
        args.clerkId,
        args.scope,
        args.profileId,
      ),
      recallSkillIndex(ctx, args.clerkId, args.scope),
      recallProfile(ctx, args.clerkId, args.scope),
      embeddingKey === undefined
        ? null
        : readQueryEmbeddingCache(ctx, embeddingKey),
      getUserByClerkId(ctx, args.clerkId),
    ]);
    return {
      profileId,
      skills,
      profile,
      embeddingHit,
      userId: user?._id ?? null,
    };
  },
});
