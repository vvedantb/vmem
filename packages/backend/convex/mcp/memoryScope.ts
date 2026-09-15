import type { MemoryWithTags } from "@vmem/sdk";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { McpScope } from "../profiles/mcpAccess";
import { resolveProfileIdForMcpScope } from "../memoryScope";

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
  if (args.mcpScope === "team") {
    return run({ clerkId: args.clerkId, mcpScope: "team", profileId });
  }
  return run({ clerkId: args.clerkId, mcpScope: "personal", profileId });
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
