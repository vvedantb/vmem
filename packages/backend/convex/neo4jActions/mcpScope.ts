"use node";

import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { getDriver } from "../../engine/neo4j/driver";
import { getMemory } from "../../engine/neo4j/memory/crud";
import type { MemoryWithTags } from "../../engine/neo4j/memory/types";
import { mcpScopeValidator, type McpScope } from "../profiles/mcpAccess";
import { resolveProfileIdForMcpScope } from "./_memories/shared";
import { runGetMemoryForTeam } from "./_memories/team";

export const scopedMcpArgs = {
  clerkId: v.string(),
  mcpScope: mcpScopeValidator,
};

// Discriminated on mcpScope, mirroring MemoryReadScope's kind union: team is
// keyed on profileId alone (the whole team scope), so it statically requires
// one; personal keeps the same shape it has always resolved to.
export type McpResolvedScope =
  | { clerkId: string; mcpScope: "team"; profileId: string }
  | { clerkId: string; mcpScope: "personal"; profileId: string };

// resolve MCP profile scope, then run the handler with the resolved ids
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

// team vs personal branch after scope resolution
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

export async function loadMemoryForMcpScope(args: {
  clerkId: string;
  mcpScope: McpScope;
  profileId: string;
  memoryId: string;
}): Promise<MemoryWithTags> {
  if (args.mcpScope === "team") {
    const memory = await runGetMemoryForTeam({
      profileId: args.profileId,
      memoryId: args.memoryId,
    });
    if (!memory) {
      throw new Error("Memory not found");
    }
    return memory;
  }

  const memory = await getMemory(getDriver(), args.clerkId, args.memoryId);
  if (
    !memory ||
    !memoryMatchesMcpScope(memory, args.mcpScope, args.profileId)
  ) {
    throw new Error("Memory not found");
  }
  return memory;
}
