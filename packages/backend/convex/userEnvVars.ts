import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import { authQuery, authMutation } from "./auth";

export const list = authQuery({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("userEnvVars")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();

    if (!doc) return [];
    return doc.vars.map((entry) => ({
      key: entry.key,
      value: "••••••",
    }));
  },
});

/** Removes a single env var by key. No-op when the user has no doc yet. */
export const removeVar = authMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userEnvVars")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .first();
    if (!doc) return null;

    const vars = doc.vars.filter((entry) => entry.key !== args.key);
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Returns raw (encrypted) env var entries for a user.
 * Internal-only — callers decrypt via `lib/envVars.ts` or `userEnvVarsActions.revealValue`.
 */
export const getAllInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userEnvVars")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!doc) return [];
    return doc.vars;
  },
});

/**
 * Inserts or updates a single env var entry for a user.
 *
 * When `preservedPrevKey` is supplied and differs from `key`, the entry with
 * that old key is removed first — enabling atomic key renames. An entry
 * already matching `key` is always replaced (upsert semantics).
 */
export const upsertVarInternal = internalMutation({
  args: {
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    preservedPrevKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("userEnvVars")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const keysToStrip = new Set<string>([args.key]);
    if (args.preservedPrevKey && args.preservedPrevKey !== args.key) {
      keysToStrip.add(args.preservedPrevKey);
    }

    if (doc) {
      const vars = doc.vars.filter((entry) => !keysToStrip.has(entry.key));
      vars.push({ key: args.key, value: args.value });
      await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("userEnvVars", {
        userId: args.userId,
        vars: [{ key: args.key, value: args.value }],
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
