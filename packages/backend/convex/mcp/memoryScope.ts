import type { MemoryWithTags } from "@vmem/sdk";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { resolveProfileIdForMcpScope } from "../memoryScope";
import type { MemoryReadScope } from "../../engine/memory/scope";
import {
  updateMemoryForClerk,
  type UpdateMemoryRuntimeArgs,
} from "../memoryRuntime";

export type McpResolvedScope =
  | { clerkId: string; mcpScope: "team"; profileId: string }
  | { clerkId: string; mcpScope: "personal"; profileId: string };

export async function withMcpMemoryScope<T>(
  ctx: ActionCtx,
  args: { clerkId: string; mcpScope: McpScope; profileId?: string },
  run: (scope: McpResolvedScope) => Promise<T>,
): Promise<T> {
  const profileId = await resolveProfileIdForMcpScope(
    ctx,
    args.clerkId,
    args.mcpScope,
    args.profileId,
  );
  return run(toMcpResolvedScope(args.clerkId, args.mcpScope, profileId));
}

export function toMcpResolvedScope(
  clerkId: string,
  mcpScope: McpScope,
  profileId: string,
): McpResolvedScope {
  if (mcpScope === "team") return { clerkId, mcpScope: "team", profileId };
  return { clerkId, mcpScope: "personal", profileId };
}

export async function runForMcpScope<T>(
  scope: McpResolvedScope,
  handlers: {
    team: (profileId: string) => Promise<T>;
    personal: (args: { clerkId: string; profileId: string }) => Promise<T>;
  },
): Promise<T> {
  if (scope.mcpScope === "team") {
    return handlers.team(scope.profileId);
  }
  return handlers.personal({
    clerkId: scope.clerkId,
    profileId: scope.profileId,
  });
}

// store read scope for a resolved MCP scope (personal keeps legacy
// profile-less rows, team is strict on the profile)
export function memoryReadScopeForMcp(
  scope: McpResolvedScope,
): MemoryReadScope {
  if (scope.mcpScope === "team") {
    return { kind: "team", profileId: scope.profileId };
  }
  return {
    kind: "personal",
    userId: scope.clerkId,
    profileId: scope.profileId,
  };
}

export function memoryMatchesMcpScope(
  memory: MemoryWithTags,
  mcpScope: McpScope,
  profileId: string,
): boolean {
  if (mcpScope === "team") {
    return memory.profileId === profileId;
  }
  return memory.profileId === profileId || memory.profileId === null;
}

export async function loadMemoryForMcpScope(
  ctx: Pick<ActionCtx, "runQuery">,
  args: {
    clerkId: string;
    mcpScope: McpScope;
    profileId: string;
    memoryId: string;
  },
): Promise<MemoryWithTags> {
  if (args.mcpScope === "team") {
    const memory = await ctx.runQuery(
      internal.memoryStore.functions.getMemoryForTeamInternal,
      { profileId: args.profileId, memoryId: args.memoryId },
    );
    if (!memory) {
      throw new Error("Memory not found");
    }
    return memory;
  }

  const memory = await ctx.runQuery(
    internal.memoryStore.functions.getMemoryInternal,
    { userId: args.clerkId, memoryId: args.memoryId },
  );
  if (
    !memory ||
    !memoryMatchesMcpScope(memory, args.mcpScope, args.profileId)
  ) {
    throw new Error("Memory not found");
  }
  return memory;
}

// Ownership check plus update, as memory_update and the bulk tag tools do it.
// Team memories are written as their author, like the web team update path.
export async function updateMemoryInMcpScope(
  ctx: ActionCtx,
  scope: McpResolvedScope,
  memoryId: string,
  patch: Omit<UpdateMemoryRuntimeArgs, "clerkId" | "memoryId">,
): Promise<MemoryWithTags | null> {
  const memory = await loadMemoryForMcpScope(ctx, { ...scope, memoryId });
  return updateMemoryForClerk(ctx, {
    ...patch,
    clerkId: memory.userId,
    memoryId,
  });
}
