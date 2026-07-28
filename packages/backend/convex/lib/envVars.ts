import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { decryptToken } from "./crypto";

async function resolveUserEnvVars(
  ctx: ActionCtx,
  userId: Id<"users">,
): Promise<Record<string, string>> {
  const entries: Array<{ key: string; value: string }> = await ctx.runQuery(
    internal.userEnvVars.getAllInternal,
    { userId },
  );
  const out: Record<string, string> = {};
  for (const entry of entries) {
    out[entry.key] = await decryptToken(entry.value);
  }
  return out;
}

async function resolveUserIdAndEnvVars(
  ctx: ActionCtx,
  clerkId: string,
): Promise<{ userId: Id<"users">; all: Record<string, string> } | null> {
  const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
    clerkId,
  });
  if (!user) return null;
  return { userId: user._id, all: await resolveUserEnvVars(ctx, user._id) };
}

// soft-fail lookup, null when user or env var missing
export async function tryUserAndApiKeyByClerkId(
  ctx: ActionCtx,
  clerkId: string,
  key: string,
): Promise<{ userId: Id<"users">; apiKey: string } | null> {
  const resolved = await resolveUserIdAndEnvVars(ctx, clerkId);
  if (!resolved) return null;
  const apiKey = resolved.all[key];
  if (!apiKey) return null;
  return { userId: resolved.userId, apiKey };
}
