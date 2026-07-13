import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { decryptToken } from "./crypto";

/**
 * Helpers for server-side code (actions) that needs to consume a user's
 * encrypted env vars (e.g. `OPENROUTER_API_KEY`) when calling third-party
 * providers on the user's behalf.
 *
 * Plaintext only ever lives on the ActionCtx call stack; it never returns
 * to the client and is never logged.
 */

/** Returns a `{ KEY: plaintext }` map of all env vars for a user. */
export async function resolveUserEnvVars(
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

/**
 * Returns the plaintext value for a single env var, or throws a user-facing
 * error pointing them at the settings page when it isn't configured.
 */
export async function requireUserEnvVar(
  ctx: ActionCtx,
  userId: Id<"users">,
  key: string,
): Promise<string> {
  const all = await resolveUserEnvVars(ctx, userId);
  const value = all[key];
  if (!value) {
    throw new Error(
      `Env var "${key}" is not configured. Set it in Settings → Secrets.`,
    );
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClerkId variants — Convex actions that wrap Neo4j work carry `clerkId`
// (Clerk user subject), not `Id<"users">`. These helpers translate before
// calling the id-based helpers above.
// ─────────────────────────────────────────────────────────────────────────────

async function lookupUserIdByClerkId(
  ctx: ActionCtx,
  clerkId: string,
): Promise<Id<"users"> | null> {
  const user = await ctx.runQuery(internal.users.getByClerkIdInternal, {
    clerkId,
  });
  return user?._id ?? null;
}

/**
 * Resolves clerkId → userId and loads that user's decrypted env vars in
 * one shot. Returns null when no user record exists. Shared by the two
 * soft-fail lookups below.
 */
async function resolveUserIdAndEnvVars(
  ctx: ActionCtx,
  clerkId: string,
): Promise<{ userId: Id<"users">; all: Record<string, string> } | null> {
  const userId = await lookupUserIdByClerkId(ctx, clerkId);
  if (!userId) return null;
  const all = await resolveUserEnvVars(ctx, userId);
  return { userId, all };
}

/**
 * Throws if either the user record or the requested env var is missing.
 * Use this for features that cannot meaningfully degrade without the key.
 */
export async function requireUserEnvVarByClerkId(
  ctx: ActionCtx,
  clerkId: string,
  key: string,
): Promise<string> {
  const userId = await lookupUserIdByClerkId(ctx, clerkId);
  if (!userId) throw new Error(`No user record for clerkId ${clerkId}`);
  return requireUserEnvVar(ctx, userId, key);
}

/**
 * Soft variant: returns null (instead of throwing) when the user has no
 * env var of that key set, or when no user record exists. Use this for
 * features that gracefully fall back without the key (e.g. embedding
 * generation on memory create — we still want the memory to save).
 *
 * Note: other errors (decryption failure, Convex query failure) still
 * propagate — we only swallow the "key not configured" case.
 */
export async function tryUserEnvVarByClerkId(
  ctx: ActionCtx,
  clerkId: string,
  key: string,
): Promise<string | null> {
  const resolved = await resolveUserIdAndEnvVars(ctx, clerkId);
  return resolved?.all[key] ?? null;
}

/**
 * Companion to `tryUserEnvVarByClerkId` that returns BOTH the resolved
 * Convex `userId` and the plaintext env var value in a single call.
 *
 * Use this from actions that need the userId for downstream logging
 * (e.g. the OpenRouter wrapper stamps `userId` on every log row). Avoids
 * the redundant clerkId→userId lookup that two separate helper calls
 * would otherwise trigger.
 *
 * Returns null when either the user record or the env var is missing —
 * same soft-fail contract as `tryUserEnvVarByClerkId`.
 */
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
