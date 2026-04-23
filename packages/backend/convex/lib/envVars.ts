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
      `Env var "${key}" is not configured. Set it in Settings → Env Vars.`,
    );
  }
  return value;
}
