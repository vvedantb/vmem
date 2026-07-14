import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery, authMutation, getUserByClerkId } from "./auth";
import { scheduleContextPromptInvalidationForUser } from "./lib/contextPromptInvalidate";
import {
  deleteVersionsForSkill,
  maybeSnapshotSkillVersion,
} from "./lib/versionSnapshot";
import {
  assertContentDeletable,
  assertContentEditable,
  requireContentScopeAccess,
} from "./teams/auth";

// missing `enabled` is treated as enabled for existing rows
function isSkillEnabled(skill: { enabled?: boolean }): boolean {
  return skill.enabled !== false;
}

// A skill as seen by every prompt surface, regardless of whether it is a personal
export interface EffectiveSkill {
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  source: "personal" | "system";
  // the personal skill's id — present only for `source === "personal"`
  skillId?: Id<"skills">;
  // present only for `source === "system"`
  systemSkillId?: Id<"systemSkills">;
}

export type SkillIndexSlice = Pick<EffectiveSkill, "name" | "description">;

// name + description for skills index surfaces (MCP, context prompt, chat)
export function toSkillIndexEntry(skill: SkillIndexSlice): SkillIndexSlice {
  return { name: skill.name, description: skill.description };
}

// resolve a user's EFFECTIVE skills = their enabled personal skills + the system
async function resolveEffectiveSkills(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<EffectiveSkill[]> {
  const personalRows = await ctx.db
    .query("skills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const out: EffectiveSkill[] = [];
  const seen = new Set<string>();

  for (const skill of personalRows) {
    if (skill.teamId !== undefined || !isSkillEnabled(skill)) continue;
    const key = skill.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      enabled: true,
      source: "personal",
      skillId: skill._id,
    });
  }

  const installs = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const install of installs) {
    if (install.teamId !== undefined || !install.enabled) continue;
    const sys = await ctx.db.get(install.systemSkillId);
    if (!sys) continue; // catalog row was deleted
    const key = sys.name.toLowerCase();
    if (seen.has(key)) continue; // personal (or an earlier install) wins
    seen.add(key);
    out.push({
      name: sys.name,
      description: sys.description,
      instructions: sys.instructions,
      enabled: true,
      source: "system",
      systemSkillId: sys._id,
    });
  }

  return out;
}

// true when this workspace has an install of a system skill with this name
async function scopeHasInstalledSystemSkillNamed(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  name: string,
): Promise<boolean> {
  if (teamId !== undefined) {
    const installs = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
    for (const install of installs) {
      const sys = await ctx.db.get(install.systemSkillId);
      if (sys && sys.name === name) return true;
    }
    return false;
  }
  const installs = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const install of installs) {
    if (install.teamId !== undefined) continue;
    const sys = await ctx.db.get(install.systemSkillId);
    if (sys && sys.name === name) return true;
  }
  return false;
}

// name-uniqueness lookup within one scope
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

// skip context-prompt cache invalidation for team-scoped writes
async function invalidateContextPromptIfPersonal(
  ctx: MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
): Promise<void> {
  if (teamId !== undefined) return;
  await scheduleContextPromptInvalidationForUser(ctx, userId);
}

// reject a skill name already taken in the target scope
async function assertSkillNameAvailableInScope(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
  trimmedName: string,
): Promise<void> {
  const existing = await findSkillByNameInScope(
    ctx,
    userId,
    teamId,
    trimmedName,
  );
  if (existing) {
    throw new Error("A skill with this name already exists");
  }
  if (
    await scopeHasInstalledSystemSkillNamed(ctx, userId, teamId, trimmedName)
  ) {
    throw new Error(
      "A system skill with this name is installed. Uninstall it or choose another name.",
    );
  }
}

// user-editable skill fields, all optional (a patch or an update request)
type SkillWritableFields = {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
};

// assemble the patch for a skill update from optionally-provided fields, applying the
async function buildSkillUpdatePatch(
  ctx: QueryCtx | MutationCtx,
  skill: Doc<"skills">,
  fields: SkillWritableFields,
): Promise<SkillWritableFields & { updatedAt: number }> {
  const patch: SkillWritableFields & { updatedAt: number } = {
    updatedAt: Date.now(),
  };

  if (fields.name !== undefined) {
    const trimmedName = fields.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }
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
  if (fields.description !== undefined) patch.description = fields.description;
  if (fields.instructions !== undefined) {
    patch.instructions = fields.instructions;
  }
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;

  return patch;
}

// normalize a skill id string and fetch the row, throwing if either fails
async function resolveSkillOrThrow(
  ctx: QueryCtx | MutationCtx,
  rawId: string,
): Promise<Doc<"skills">> {
  const normalizedId = ctx.db.normalizeId("skills", rawId);
  if (!normalizedId) throw new Error("Invalid skill id");
  const skill = await ctx.db.get(normalizedId);
  if (!skill) throw new Error("Skill not found");
  return skill;
}

// list skills in a scope, newest-first
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

// the caller's effective skills (enabled personal + installed-and-enabled system
export const listEffectiveSkills = authQuery({
  args: {},
  handler: async (ctx): Promise<EffectiveSkill[]> => {
    return await resolveEffectiveSkills(ctx, ctx.userId);
  },
});

// create a new skill in a scope
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

    await assertSkillNameAvailableInScope(
      ctx,
      ctx.userId,
      args.teamId,
      trimmedName,
    );

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

// update an existing skill
export const updateSkill = authMutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const skill = await resolveSkillOrThrow(ctx, args.id);
    await assertContentEditable(ctx, skill, ctx.userId);

    const patch = await buildSkillUpdatePatch(ctx, skill, {
      name: args.name,
      description: args.description,
      instructions: args.instructions,
      enabled: args.enabled,
    });

    await maybeSnapshotSkillVersion(ctx, skill, {
      source: "web",
      authorUserId: ctx.userId,
    });
    await ctx.db.patch(skill._id, patch);
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

// delete a skill
export const deleteSkill = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const skill = await resolveSkillOrThrow(ctx, args.id);
    await assertContentDeletable(ctx, skill, ctx.userId);
    await deleteVersionsForSkill(ctx, skill._id);
    await ctx.db.delete(skill._id);
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

// bulk-delete skills (each with its version snapshots)
export const deleteSkills = authMutation({
  args: { ids: v.array(v.id("skills")) },
  handler: async (ctx, args) => {
    let anyPersonal = false;
    for (const id of args.ids) {
      const skill = await ctx.db.get(id);
      if (!skill) continue;
      await assertContentDeletable(ctx, skill, ctx.userId);
      await deleteVersionsForSkill(ctx, id);
      await ctx.db.delete(id);
      if (skill.teamId === undefined) anyPersonal = true;
    }
    if (anyPersonal) {
      await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
    }
  },
});

// restore a skill to a previous version
export const restoreVersion = authMutation({
  args: { versionId: v.id("skillVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");
    const skill = await ctx.db.get(version.skillId);
    if (!skill) throw new Error("Skill not found");
    await assertContentEditable(ctx, skill, ctx.userId);

    if (version.name !== skill.name) {
      const duplicate = await findSkillByNameInScope(
        ctx,
        skill.userId,
        skill.teamId,
        version.name,
      );
      if (duplicate) {
        throw new Error("A skill with this name already exists");
      }
    }

    await maybeSnapshotSkillVersion(ctx, skill, {
      source: "web",
      authorUserId: ctx.userId,
      force: true,
    });

    await ctx.db.patch(skill._id, {
      name: version.name,
      description: version.description,
      instructions: version.instructions,
      enabled: version.enabled,
      updatedAt: Date.now(),
    });
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

// internal helpers (used by MCP HTTP routes after JWT verification) --- MCP stays

// effective skills (personal + installed system skills) for a Clerk user id
export const listEffectiveByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<EffectiveSkill[]> => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return [];
    return await resolveEffectiveSkills(ctx, user._id);
  },
});

// resolve one effective skill by name for a Clerk user id (personal first, then
export const getEffectiveByNameInternal = internalQuery({
  args: { clerkId: v.string(), name: v.string() },
  handler: async (ctx, args): Promise<EffectiveSkill | null> => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return null;
    const lookup = args.name.trim().toLowerCase();
    const effective = await resolveEffectiveSkills(ctx, user._id);
    return effective.find((s) => s.name.toLowerCase() === lookup) ?? null;
  },
});

// workspace-scoped enabled skills for the memory graph (personal or team)
export const listForGraphInternal = internalQuery({
  args: {
    userId: v.id("users"),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    if (args.teamId !== undefined) {
      const teamId = args.teamId;
      const rows = await ctx.db
        .query("skills")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .order("desc")
        .collect();
      return rows.filter((s) => isSkillEnabled(s));
    }
    const rows = await ctx.db
      .query("skills")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
    return rows.filter((s) => isSkillEnabled(s) && s.teamId === undefined);
  },
});

// create a skill for a given Clerk user id (MCP after JWT verification)
export const createByClerkIdInternal = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) {
      throw new Error("User not found");
    }

    const trimmedName = args.name.trim();
    if (trimmedName.length === 0) {
      throw new Error("Name is required");
    }

    await assertSkillNameAvailableInScope(
      ctx,
      user._id,
      undefined,
      trimmedName,
    );

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

// update a skill for a given Clerk user id (MCP after JWT verification)
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

    const user = await getUserByClerkId(ctx, args.clerkId);
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

    const patch = await buildSkillUpdatePatch(ctx, skill, {
      name: args.newName,
      description: args.description,
      instructions: args.instructions,
      enabled: args.enabled,
    });

    // agent (MCP) writes always checkpoint the pre-write state
    await maybeSnapshotSkillVersion(ctx, skill, {
      source: "mcp",
      authorUserId: user._id,
      force: true,
    });
    await ctx.db.patch(skill._id, patch);
    await scheduleContextPromptInvalidationForUser(ctx, user._id);

    const updated = await ctx.db.get(skill._id);
    if (!updated) {
      throw new Error("Failed to update skill");
    }
    return updated;
  },
});

// delete a skill by name for a given Clerk user id (MCP after JWT verification)
export const deleteByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
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

    await deleteVersionsForSkill(ctx, skill._id);
    await ctx.db.delete(skill._id);
    await scheduleContextPromptInvalidationForUser(ctx, user._id);
    return null;
  },
});

// enabled skills of a team
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
