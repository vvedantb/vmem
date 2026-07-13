/**
 * Team-scope memoryApi handlers. These power the Company Knowledge UI.
 *
 * Authorization model:
 *   - Reads (list, get, search): membership via `assertTeamAccess` is
 *     sufficient; any team member can read every memory in the team
 *     profile.
 *   - Writes (update, delete): caller must EITHER be the original
 *     creator OR a team owner. The dual-path is hidden behind
 *     `assertMemoryMutablePermissionInternal`.
 *
 * The underlying Cypher is per-user-scoped (MATCH on `userId`), so for
 * mutations we pass the *creator's* clerkId — even when a team owner is
 * the actual caller. Authorization has already been verified by the time
 * we hit Neo4j.
 */

import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireClerkId, assertTeamAccess, type AuthActionCtx } from "./auth";
import type { MemoryWithTags, MemoryListResult } from "./types";

interface ListTeamMemoriesArgs {
  profileId: Id<"profiles">;
  type?: string;
  status?: string;
  tags?: string[];
  limit: number;
  offset: number;
}

export async function runListTeamMemories(
  ctx: AuthActionCtx,
  args: ListTeamMemoriesArgs,
): Promise<MemoryListResult> {
  await assertTeamAccess(ctx, args.profileId);
  return await ctx.runAction(
    internal.neo4jActions.memories.listMemoriesForTeamInternal,
    {
      profileId: args.profileId,
      type: args.type,
      status: args.status,
      tags: args.tags,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

export async function runGetTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  await assertTeamAccess(ctx, args.profileId);
  return await ctx.runAction(
    internal.neo4jActions.memories.getMemoryForTeamInternal,
    { profileId: args.profileId, memoryId: args.memoryId },
  );
}

interface SearchTeamMemoriesArgs {
  profileId: Id<"profiles">;
  query?: string;
  type?: string;
  tags?: string[];
  source?: string;
  limit: number;
  offset: number;
}

export async function runSearchTeamMemories(
  ctx: AuthActionCtx,
  args: SearchTeamMemoriesArgs,
): Promise<MemoryListResult> {
  await assertTeamAccess(ctx, args.profileId);
  return await ctx.runAction(
    internal.neo4jActions.memories.searchMemoriesForTeamInternal,
    {
      profileId: args.profileId,
      query: args.query,
      type: args.type,
      tags: args.tags,
      source: args.source,
      limit: args.limit,
      offset: args.offset,
    },
  );
}

interface UpdateTeamMemoryArgs {
  profileId: Id<"profiles">;
  memoryId: string;
  title?: string;
  content?: string;
  type?: string;
  status?: string;
  tags?: string[];
  confidence?: number;
  expiresAt?: string | null;
}

/**
 * Load a team memory and assert the caller may mutate it (creator or
 * team owner). Returns null when the memory is missing.
 */
async function loadMutableTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<MemoryWithTags | null> {
  await assertTeamAccess(ctx, args.profileId);

  const memory = await ctx.runAction(
    internal.neo4jActions.memories.getMemoryForTeamInternal,
    { profileId: args.profileId, memoryId: args.memoryId },
  );
  if (!memory) return null;

  // Creator clerkId is needed so the per-user Cypher path matches the
  // right node — including when a non-creator team owner is the caller.
  await ctx.runQuery(internal.teams.assertMemoryMutablePermissionInternal, {
    userId: ctx.userId,
    memoryCreatorClerkId: memory.userId,
    profileId: args.profileId,
  });

  return memory;
}

/**
 * Update a team memory. Allowed if caller is the original creator OR is
 * a team owner. Both paths use the creator-scoped `updateMemoryInternal`
 * since that's how Cypher locates the node — we've already authorized.
 */
export async function runUpdateTeamMemory(
  ctx: AuthActionCtx,
  args: UpdateTeamMemoryArgs,
): Promise<MemoryWithTags | null> {
  await requireClerkId(ctx);

  const memory = await loadMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) throw new Error("Memory not found");

  return await ctx.runAction(
    internal.neo4jActions.memories.updateMemoryInternal,
    {
      clerkId: memory.userId,
      memoryId: args.memoryId,
      title: args.title,
      content: args.content,
      type: args.type,
      status: args.status,
      tags: args.tags,
      confidence: args.confidence,
      expiresAt: args.expiresAt,
    },
  );
}

/**
 * Delete a team memory. Creator hits the standard per-user delete path
 * (logs the event under the caller). Non-creator team owners fall
 * through to the profile-scoped owner-override path.
 */
export async function runDeleteTeamMemory(
  ctx: AuthActionCtx,
  args: { profileId: Id<"profiles">; memoryId: string },
): Promise<boolean> {
  const callerClerkId = await requireClerkId(ctx);

  const memory = await loadMutableTeamMemory(ctx, {
    profileId: args.profileId,
    memoryId: args.memoryId,
  });
  if (!memory) return false;

  if (memory.userId === callerClerkId) {
    return await ctx.runAction(
      internal.neo4jActions.memories.deleteMemoryInternal,
      { clerkId: callerClerkId, memoryId: args.memoryId },
    );
  }

  return await ctx.runAction(
    internal.neo4jActions.memories.deleteTeamMemoryAsOwnerInternal,
    {
      profileId: args.profileId,
      memoryId: args.memoryId,
      ownerClerkId: callerClerkId,
    },
  );
}
