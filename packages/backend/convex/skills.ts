import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery, authMutation } from "./auth";
import { scheduleContextPromptInvalidationForUser } from "./lib/contextPromptInvalidate";
import {
  assertContentDeletable,
  assertContentEditable,
  requireContentScopeAccess,
} from "./teams/auth";

/** Missing `enabled` is treated as enabled for existing rows. */
function isSkillEnabled(skill: { enabled?: boolean }): boolean {
  return skill.enabled !== false;
}

/**
 * Name-uniqueness lookup within one scope: team skills compete only with
 * that team's names, personal skills only with the user's personal names.
 */
async function findSkillByNameInScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  name: string,
): Promise<Doc<"skills"> | null> {
  if (teamId !== undefined) {
    return await ctx.db
      .query("skills")
      .withIndex("by_team_name", (q) => q.eq("teamId", teamId).eq("name", name))
      .first();
  }
  return await ctx.db
    .query("skills")
    .withIndex("by_user_name", (q) => q.eq("userId", userId).eq("name", name))
    .filter((q) => q.eq(q.field("teamId"), undefined))
    .first();
}

/**
 * Skip context-prompt cache invalidation for team-scoped writes: the cached
 * MCP context prompt only embeds the user's PERSONAL skills index.
 */
async function invalidateContextPromptIfPersonal(
  ctx: MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<void> {
  if (teamId !== undefined) return;
  await scheduleContextPromptInvalidationForUser(ctx, userId);
}

/**
 * List skills in a scope, newest-first. No `teamId` = the user's personal
 * skills (shared across all personal workspaces); `teamId` = that team's
 * skills (members only).
 */
export const listMy = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    if (args.teamId !== undefined) {
      const teamId = args.teamId;
      return await ctx.db
        .query("skills")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .order("desc")
        .collect();
    }
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();
    return rows.filter((s) => s.teamId === undefined);
  },
});

/**
 * Create a new skill in a scope. Duplicate names per scope are rejected.
 */
export const createSkill = authMutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }

    const existing = await findSkillByNameInScope(
      ctx,
      ctx.userId,
      args.teamId,
      trimmedName,
    );
    if (existing) {
      throw new Error("A skill with this name already exists");
    }

    const now = Date.now();
    const id = await ctx.db.insert("skills", {
      userId: ctx.userId,
      teamId: args.teamId,
      name: trimmedName,
      description: args.description,
      instructions: args.instructions,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, args.teamId);
    return id;
  },
});

/**
 * Update an existing skill. Personal: owner only. Team: any member
 * (collaborative). Only provided fields are patched.
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
    if (!skill) throw new Error("Skill not found");
    await assertContentEditable(ctx, skill, ctx.userId);

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
      // If renaming, ensure no duplicate exists within the skill's scope.
      if (trimmedName !== skill.name) {
        const duplicate = await findSkillByNameInScope(
          ctx,
          skill.userId,
          skill.teamId,
          trimmedName,
        );
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
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

/**
 * Delete a skill. Personal: owner only. Team: creator or team owner.
 */
export const deleteSkill = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("skills", args.id);
    if (!normalizedId) throw new Error("Invalid skill id");
    const skill = await ctx.db.get(normalizedId);
    if (!skill) throw new Error("Skill not found");
    await assertContentDeletable(ctx, skill, ctx.userId);
    await ctx.db.delete(normalizedId);
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

// --- Internal helpers (used by MCP HTTP routes after JWT verification) ---
// MCP stays personal-only for now: every lookup filters `teamId === undefined`
// so team skills never leak into (or get mutated through) MCP tools.

/**
 * List personal skills for a given Clerk user id.
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
    return rows.filter((s) => isSkillEnabled(s) && s.teamId === undefined);
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

    const existing = await findSkillByNameInScope(
      ctx,
      user._id,
      undefined,
      trimmedName,
    );
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
 * Update a skill for a given Clerk user id (MCP after JWT verification).
 */
export const updateByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    newName: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const hasPatch =
      args.newName !== undefined ||
      args.description !== undefined ||
      args.instructions !== undefined ||
      args.enabled !== undefined;
    if (!hasPatch) {
      throw new Error("At least one field to update is required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    const lookupName = args.name.trim();
    const skill = await findSkillByNameInScope(
      ctx,
      user._id,
      undefined,
      lookupName,
    );
    if (!skill) {
      throw new Error("Skill not found");
    }

    const patch: {
      name?: string;
      description?: string;
      instructions?: string;
      enabled?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.newName !== undefined) {
      const trimmedName = args.newName.trim();
      if (trimmedName.length === 0) {
        throw new Error("Name is required");
      }
      if (trimmedName !== skill.name) {
        const duplicate = await findSkillByNameInScope(
          ctx,
          user._id,
          undefined,
          trimmedName,
        );
        if (duplicate) {
          throw new Error("A skill with this name already exists");
        }
      }
      patch.name = trimmedName;
    }
    if (args.description !== undefined) patch.description = args.description;
    if (args.instructions !== undefined) patch.instructions = args.instructions;
    if (args.enabled !== undefined) patch.enabled = args.enabled;

    await ctx.db.patch(skill._id, patch);
    await scheduleContextPromptInvalidationForUser(ctx, user._id);

    const updated = await ctx.db.get(skill._id);
    if (!updated) {
      throw new Error("Failed to update skill");
    }
    return updated;
  },
});

/**
 * Delete a skill by name for a given Clerk user id (MCP after JWT verification).
 */
export const deleteByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();
    if (!user) {
      throw new Error("User not found");
    }

    const lookupName = args.name.trim();
    const skill = await findSkillByNameInScope(
      ctx,
      user._id,
      undefined,
      lookupName,
    );
    if (!skill) {
      throw new Error("Skill not found");
    }

    await ctx.db.delete(skill._id);
    await scheduleContextPromptInvalidationForUser(ctx, user._id);
    return null;
  },
});

/**
 * Enabled skills of a team — for cloud chat's merged (personal + team)
 * skills index when a thread lives in a team workspace. Membership is
 * verified upstream (thread ownership + profile access in chat).
 */
export const listTeamSkillsInternal = internalQuery({
  args: { teamId: v.id("teams") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();
    return rows.filter(isSkillEnabled);
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

    const lookupName = args.name.trim();
    const skill = await findSkillByNameInScope(
      ctx,
      user._id,
      undefined,
      lookupName,
    );
    if (!skill || !isSkillEnabled(skill)) return null;
    return skill;
  },
});
