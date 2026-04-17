import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { authQuery, authMutation } from "./auth";

/**
 * List all skills owned by the authenticated user, newest-first.
 */
export const listMy = authQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("skills")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();
  },
});

/**
 * Fetch a single skill by id, scoped to the authenticated user.
 * Accepts a string id to match the pattern used by codebases.getById.
 */
export const getById = authQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("skills", args.id);
    if (!normalizedId) return null;
    const skill = await ctx.db.get(normalizedId);
    if (!skill || skill.userId !== ctx.userId) return null;
    return skill;
  },
});

/**
 * Create a new skill. Duplicate names per user are rejected.
 */
export const createSkill = authMutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }

    const existing = await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", ctx.userId).eq("name", trimmedName),
      )
      .first();
    if (existing) {
      throw new Error("A skill with this name already exists");
    }

    const now = Date.now();
    return await ctx.db.insert("skills", {
      userId: ctx.userId,
      name: trimmedName,
      description: args.description,
      instructions: args.instructions,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing skill. Only provided fields are patched.
 */
export const updateSkill = authMutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("skills", args.id);
    if (!normalizedId) throw new Error("Invalid skill id");
    const skill = await ctx.db.get(normalizedId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }

    const patch: {
      name?: string;
      description?: string;
      instructions?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const trimmedName = args.name.trim();
      if (trimmedName.length === 0) {
        throw new Error("Name is required");
      }
      // If renaming, ensure no duplicate exists for this user.
      if (trimmedName !== skill.name) {
        const duplicate = await ctx.db
          .query("skills")
          .withIndex("by_user_name", (q) =>
            q.eq("userId", ctx.userId).eq("name", trimmedName),
          )
          .first();
        if (duplicate) {
          throw new Error("A skill with this name already exists");
        }
      }
      patch.name = trimmedName;
    }
    if (args.description !== undefined) patch.description = args.description;
    if (args.instructions !== undefined) patch.instructions = args.instructions;

    await ctx.db.patch(normalizedId, patch);
  },
});

/**
 * Delete a skill owned by the authenticated user.
 */
export const deleteSkill = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("skills", args.id);
    if (!normalizedId) throw new Error("Invalid skill id");
    const skill = await ctx.db.get(normalizedId);
    if (!skill || skill.userId !== ctx.userId) {
      throw new Error("Skill not found");
    }
    await ctx.db.delete(normalizedId);
  },
});

// --- Internal helpers (used by MCP HTTP routes after JWT verification) ---

/**
 * List skills for a given Clerk user id.
 */
export const listByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return [];

    return await ctx.db
      .query("skills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

/**
 * Fetch a single skill by name for a given Clerk user id.
 */
export const getByNameInternal = internalQuery({
  args: { clerkId: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) return null;

    return await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", user._id).eq("name", args.name),
      )
      .first();
  },
});
