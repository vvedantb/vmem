import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Internal mutations and queries for connector OAuth tokens.
 * Only called from internalActions (sync, callback), never directly from frontend.
 * Encryption/decryption happens in the calling action using shared crypto helpers.
 */

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
    // Delete existing tokens for this connector
    const existing = await ctx.db
      .query("connectorTokens")
      .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new tokens
    return await ctx.db.insert("connectorTokens", {
      connectorId: args.connectorId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: args.expiresAt,
      tokenType: args.tokenType,
      scope: args.scope,
    });
  },
});

export const getEncryptedTokensInternal = internalQuery({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("connectorTokens")
      .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
      .first();
  },
});

export const deleteTokensInternal = internalMutation({
  args: { connectorId: v.id("connectors") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("connectorTokens")
      .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});
