"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

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

/**
 * MCP entry point: create a new enabled skill for the authenticated user.
 */
export const mcpCreateSkill = internalAction({
  args: {
    clerkId: v.string(),
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
  },
  handler: async (ctx, args): Promise<Doc<"skills">> => {
    return await ctx.runMutation(internal.skills.createByClerkIdInternal, {
      clerkId: args.clerkId,
      name: args.name,
      description: args.description,
      instructions: args.instructions,
    });
  },
});

/**
 * MCP entry point: update an existing skill (partial patch by current name).
 */
export const mcpUpdateSkill = internalAction({
  args: {
    clerkId: v.string(),
    name: v.string(),
    newName: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Doc<"skills">> => {
    return await ctx.runMutation(internal.skills.updateByClerkIdInternal, {
      clerkId: args.clerkId,
      name: args.name,
      newName: args.newName,
      description: args.description,
      instructions: args.instructions,
      enabled: args.enabled,
    });
  },
});

/**
 * MCP entry point: permanently delete a skill by exact name.
 */
export const mcpDeleteSkill = internalAction({
  args: { clerkId: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<{ deleted: true }> => {
    await ctx.runMutation(internal.skills.deleteByClerkIdInternal, {
      clerkId: args.clerkId,
      name: args.name,
    });
    return { deleted: true };
  },
});
