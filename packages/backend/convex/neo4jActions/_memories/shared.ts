"use node";

/**
 * Shared mechanics for memory CRUD actions.
 *
 * - Type validators (`toMemoryType`, `toMemoryStatus`) for the
 *   string-typed `type`/`status` action args.
 * - Re-exports for context-prompt invalidation and best-effort embeddings.
 */

import { type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  bestEffortEmbedMany,
  bestEffortEmbedOne,
  type BestEffortEmbedParams,
} from "../../lib/openRouter/bestEffortEmbed";
import { scheduleContextPromptInvalidationByClerkId } from "../../lib/contextPromptInvalidate";
import type { McpScope } from "../../profiles/mcpAccess";

export type MemoryType = "profile" | "episodic" | "knowledge";
export type MemoryStatus = "active" | "pinned" | "suppressed" | "expired";

function isMemoryType(s: string): s is MemoryType {
  return s === "profile" || s === "episodic" || s === "knowledge";
}

function isMemoryStatus(s: string): s is MemoryStatus {
  return (
    s === "active" || s === "pinned" || s === "suppressed" || s === "expired"
  );
}

export function toMemoryType(s: string | undefined): MemoryType | undefined {
  return s !== undefined && isMemoryType(s) ? s : undefined;
}

export function toMemoryStatus(
  s: string | undefined,
): MemoryStatus | undefined {
  return s !== undefined && isMemoryStatus(s) ? s : undefined;
}

/**
 * Resolve the profileId for a memory operation.
 * Priority: explicit profileId > default profile (created if missing).
 */
export async function resolveProfileIdForClerkId(
  ctx: ActionCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  if (explicitProfileId) {
    return explicitProfileId;
  }

  const mcpActive = await ctx.runQuery(
    internal.profiles.getActiveProfileForMcpInternal,
    { clerkId },
  );
  if (mcpActive) {
    return mcpActive._id;
  }

  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

export async function resolveProfileIdForMcpScope(
  ctx: ActionCtx,
  clerkId: string,
  scope: McpScope,
  explicitProfileId?: string,
): Promise<string> {
  return ctx.runQuery(internal.profiles.resolveProfileIdForMcpScopeInternal, {
    clerkId,
    scope,
    profileId: explicitProfileId,
  });
}

export const scheduleContextPromptInvalidation =
  scheduleContextPromptInvalidationByClerkId;

type EmbedArgs = Omit<BestEffortEmbedParams, "ctx">;

/**
 * Memory actions use `(ctx, args)`; `bestEffortEmbed*` expects `{ ctx, ...args }`.
 * Do not alias these to `bestEffortEmbedOne` directly — that breaks `ctx.runQuery`.
 */
export function tryEmbedOne(
  ctx: ActionCtx,
  args: EmbedArgs & { text: string },
): Promise<number[] | null> {
  return bestEffortEmbedOne({ ctx, ...args });
}

export function tryEmbedMany(
  ctx: ActionCtx,
  args: EmbedArgs & { texts: string[] },
): Promise<(number[] | null)[]> {
  return bestEffortEmbedMany({ ctx, ...args });
}
