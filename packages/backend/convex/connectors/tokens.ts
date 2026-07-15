import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";

async function tokensForConnector(
  ctx: QueryCtx | MutationCtx,
  connectorId: Id<"connectors">,
) {
  return await ctx.db
    .query("connectorTokens")
    .withIndex("by_connector", (q) => q.eq("connectorId", connectorId))
    .first();
}

export const storeTokensInternal = internalMutation({
  args: {
    connectorId: v.id("connectors"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    tokenType: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await tokensForConnector(ctx, args.connectorId);
    const fields = {
      connectorId: args.connectorId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      tokenType: args.tokenType,
      scope: args.scope,
    };

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }

    return await ctx.db.insert("connectorTokens", fields);
  },
});

export const getEncryptedTokensInternal = internalQuery({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    return await tokensForConnector(ctx, args.connectorId);
  },
});

export const deleteTokensInternal = internalMutation({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    const existing = await tokensForConnector(ctx, args.connectorId);
    if (!existing) {
      return false;
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});
