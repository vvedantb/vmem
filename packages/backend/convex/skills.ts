import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery, authMutation } from "./auth";
import { scheduleContextPromptInvalidationForUser } from "./lib/contextPromptInvalidate";

/** Missing `enabled` is treated as enabled for existing rows. */
function isSkillEnabled(skill: { enabled?: boolean }): boolean {
  return skill.enabled !== false;
}

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
    const id = await ctx.db.insert("skills", {
      userId: ctx.userId,
      name: trimmedName,
      description: args.description,
      instructions: args.instructions,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
    return id;
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
    enabled: v.optional(v.boolean()),
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
      enabled?: boolean;
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
    if (args.enabled !== undefined) patch.enabled = args.enabled;

    await ctx.db.patch(normalizedId, patch);
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
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
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
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

    const rows = await ctx.db
      .query("skills")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
    return rows.filter(isSkillEnabled);
  },
});

/**
 * Create a skill for a given Clerk user id (MCP after JWT verification).
 */
export const createByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }

    const existing = await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", user._id).eq("name", trimmedName),
      )
      .first();
    if (existing) {
      throw new Error("A skill with this name already exists");
    }

    const now = Date.now();
    const id = await ctx.db.insert("skills", {
      userId: user._id,
      name: trimmedName,
      description: args.description,
      instructions: args.instructions,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleContextPromptInvalidationForUser(ctx, user._id);

    const created = await ctx.db.get(id);
    if (!created) {
      throw new Error("Failed to create skill");
    }
    return created;
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

    const skill = await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", user._id).eq("name", args.name),
      )
      .first();
    if (!skill || !isSkillEnabled(skill)) return null;
    return skill;
  },
});
