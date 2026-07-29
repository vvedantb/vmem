import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authQuery, authMutation } from "./auth";

function getUserEnvVarsDoc(ctx: QueryCtx, userId: Id<"users">) {
  return ctx.db
    .query("userEnvVars")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
}

export const list = authQuery({
  args: {},
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const doc = await getUserEnvVarsDoc(ctx, ctx.userId);

    if (!doc) return [];
    return doc.vars.map((entry) => ({
      key: entry.key,
      value: "••••••",
    }));
  },
});

export const removeVar = authMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await getUserEnvVarsDoc(ctx, ctx.userId);
    if (!doc) return null;

    const vars = doc.vars.filter((entry) => entry.key !== args.key);
    await ctx.db.patch(doc._id, { vars, updatedAt: Date.now() });
    return null;
  },
});

export const getAllInternal = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const doc = await getUserEnvVarsDoc(ctx, args.userId);
    if (!doc) return [];
    return doc.vars;
  },
});

export const getVarInternal = internalQuery({
  args: { userId: v.id("users"), key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const doc = await getUserEnvVarsDoc(ctx, args.userId);
    if (!doc) return null;
    return doc.vars.find((entry) => entry.key === args.key)?.value ?? null;
  },
});

export const upsertVarInternal = internalMutation({
  args: {
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    preservedPrevKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await getUserEnvVarsDoc(ctx, args.userId);

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
