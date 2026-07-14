import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authAction } from "./auth";
import { encryptToken, decryptToken } from "./lib/crypto";

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_KEY_LENGTH = 64;

function validateKey(rawKey: string): string {
  const key = rawKey.trim();
  if (!key) {
    throw new Error("Key is required");
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new Error(`Key must be ${MAX_KEY_LENGTH} characters or fewer`);
  }
  if (!KEY_RE.test(key)) {
    throw new Error(
      "Key must start with a letter or underscore and contain only letters, digits, or underscores",
    );
  }
  return key;
}

// encrypts and upserts a single env var
export const upsertVar = authAction({
  args: {
    key: v.string(),
    value: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = validateKey(args.key);
    const ciphertext = await encryptToken(args.value);
    await ctx.runMutation(internal.userEnvVars.upsertVarInternal, {
      userId: ctx.userId,
      key,
      value: ciphertext,
    });
    return null;
  },
});

// renames an env var key and/or updates its value
export const editVar = authAction({
  args: {
    oldKey: v.string(),
    newKey: v.string(),
    value: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const oldKey = args.oldKey.trim();
    if (!oldKey) {
      throw new Error("oldKey is required");
    }
    const newKey = validateKey(args.newKey);

    const existing: Array<{ key: string; value: string }> = await ctx.runQuery(
      internal.userEnvVars.getAllInternal,
      { userId: ctx.userId },
    );
    const match = existing.find((entry) => entry.key === oldKey);
    if (!match) {
      throw new Error(`Env var "${oldKey}" not found`);
    }

    const ciphertext =
      args.value === undefined ? match.value : await encryptToken(args.value);

    await ctx.runMutation(internal.userEnvVars.upsertVarInternal, {
      userId: ctx.userId,
      key: newKey,
      value: ciphertext,
      preservedPrevKey: oldKey,
    });
    return null;
  },
});

// returns the decrypted plaintext for a single env var, or `null` if missing
export const revealValue = authAction({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const entries: Array<{ key: string; value: string }> = await ctx.runQuery(
      internal.userEnvVars.getAllInternal,
      { userId: ctx.userId },
    );
    const match = entries.find((entry) => entry.key === args.key);
    if (!match) return null;
    return await decryptToken(match.value);
  },
});

// encrypts and upserts many env vars in one call (e.g
export const bulkUpsert = authAction({
  args: {
    entries: v.array(
      v.object({
        key: v.string(),
        value: v.string(),
      }),
    ),
  },
  returns: v.object({ imported: v.number() }),
  handler: async (ctx, args) => {
    let imported = 0;
    for (const entry of args.entries) {
      const key = validateKey(entry.key);
      const ciphertext = await encryptToken(entry.value);
      await ctx.runMutation(internal.userEnvVars.upsertVarInternal, {
        userId: ctx.userId,
        key,
        value: ciphertext,
      });
      imported += 1;
    }
    return { imported };
  },
});
