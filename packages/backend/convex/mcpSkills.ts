"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { verifyMcpJwt } from "../src/neo4j/mcpAuth";

function verifyTokenOrThrow(token: string): string {
  const clerkId = verifyMcpJwt(token);
  if (!clerkId) throw new Error("Invalid or expired token");
  return clerkId;
}

/**
 * MCP entry point: list all skills for the authenticated user.
 * The token is verified against the MCP JWT secret; the resulting clerkId
 * is used to look up skills via internal query.
 *
 * The explicit return type is required because `internal` indirectly references
 * this action, which would otherwise trip Convex's type inference (TS7022).
 */
export const mcpListSkills = internalAction({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<Doc<"skills">[]> => {
    const clerkId = verifyTokenOrThrow(args.token);
    return await ctx.runQuery(internal.skills.listByClerkIdInternal, {
      clerkId,
    });
  },
});

/**
 * MCP entry point: fetch a single skill by name for the authenticated user.
 */
export const mcpGetSkill = internalAction({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<Doc<"skills"> | null> => {
    const clerkId = verifyTokenOrThrow(args.token);
    return await ctx.runQuery(internal.skills.getByNameInternal, {
      clerkId,
      name: args.name,
    });
  },
});
