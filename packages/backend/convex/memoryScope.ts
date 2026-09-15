import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { McpScope } from "./profiles/mcpAccess";

type ScopeCtx = Pick<ActionCtx, "runQuery" | "runMutation">;

export async function resolveProfileIdForClerkId(
  ctx: ScopeCtx,
  clerkId: string,
  explicitProfileId?: string,
): Promise<string> {
  if (explicitProfileId) return explicitProfileId;

  const mcpActive = await ctx.runQuery(
    internal.profiles.getActiveProfileForMcpInternal,
    { clerkId },
  );
  if (mcpActive) return mcpActive._id;

  const profile = await ctx.runMutation(
    internal.profiles.getOrCreateDefaultByClerkIdInternal,
    { clerkId },
  );
  return profile._id;
}

export async function resolveProfileIdForMcpScope(
  ctx: Pick<ActionCtx, "runQuery">,
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

export async function getProfileKind(
  ctx: Pick<ActionCtx, "runQuery">,
  profileId: string | undefined,
): Promise<"personal" | "team"> {
  if (profileId === undefined) return "personal";
  return await ctx.runQuery(internal.profiles.getProfileScopeInternal, {
    profileId,
  });
}
