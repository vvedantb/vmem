"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

export interface SkillIndexRow {
  name: string;
  description: string;
}

/**
 * MCP entry point: list enabled skills (index only — no instructions).
 */
export const mcpListSkills = internalAction({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<SkillIndexRow[]> => {
    const rows: Doc<"skills">[] = await ctx.runQuery(
      internal.skills.listByClerkIdInternal,
      {
        clerkId: args.clerkId,
      },
    );
    return rows.map((skill) => ({
      name: skill.name,
      description: skill.description,
    }));
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
