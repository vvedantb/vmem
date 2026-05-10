"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/**
 * MCP entry point: list all skills for the authenticated user.
 *
 * The explicit return type is required because `internal` indirectly references
 * this action, which would otherwise trip Convex's type inference (TS7022).
 */
export const mcpListSkills = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<Doc<"skills">[]> => {
    return await ctx.runQuery(internal.skills.listByClerkIdInternal, {
      clerkId: args.clerkId,
    });
  },
});

/**
 * MCP entry point: fetch a single skill by name for the authenticated user.
 */
export const mcpGetSkill = internalAction({
  args: { clerkId: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<Doc<"skills"> | null> => {
    return await ctx.runQuery(internal.skills.getByNameInternal, {
      clerkId: args.clerkId,
      name: args.name,
    });
  },
});
