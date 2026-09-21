import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Convex deployment env. AI Gateway only — leftover OPENROUTER_API_KEY is ignored.
export function readOpenRouterApiKey(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const key = env.AI_GATEWAY_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export async function resolveOpenRouterAuth(
  ctx: Pick<ActionCtx, "runQuery">,
  clerkId: string,
): Promise<{ userId: Id<"users">; apiKey: string } | null> {
  const apiKey = readOpenRouterApiKey();
  if (!apiKey) return null;
  const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
    clerkId,
  });
  if (!user) return null;
  return { userId: user._id, apiKey };
}
