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

// missing enabled is treated as enabled for existing rows
function isSkillEnabled(skill: { enabled?: boolean }): boolean {
  return skill.enabled !== false;
}

export interface EffectiveSkill {
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  source: "personal" | "system";
  // the personal skill's id, present only for source === "personal"
  skillId?: Id<"skills">;
  // present only for source === "system"
  systemSkillId?: Id<"systemSkills">;
}

export type SkillIndexSlice = Pick<EffectiveSkill, "name" | "description">;

export function toSkillIndexEntry(skill: SkillIndexSlice): SkillIndexSlice {
  return { name: skill.name, description: skill.description };
}

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

type SkillWritableFields = {
  name?: string;
  description?: string;
  instructions?: string;
  enabled?: boolean;
};

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

async function createSkillRecord(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    teamId?: Id<"teams">;
    name: string;
    description: string;
    instructions: string;
  },
): Promise<Id<"skills">> {
  const trimmedName = args.name.trim();
  if (trimmedName.length === 0) {
    throw new Error("Name is required");
  }

  await assertSkillNameAvailableInScope(
    ctx,
    args.userId,
    args.teamId,
    trimmedName,
  );

  const now = Date.now();
  return await ctx.db.insert("skills", {
    userId: args.userId,
    teamId: args.teamId,
    name: trimmedName,
    description: args.description,
    instructions: args.instructions,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function applySkillUpdate(
  ctx: MutationCtx,
  skill: Doc<"skills">,
  patch: SkillWritableFields & { updatedAt: number },
  meta: {
    source: "web" | "mcp";
    authorUserId: Id<"users">;
    force?: boolean;
  },
): Promise<void> {
  await maybeSnapshotSkillVersion(ctx, skill, meta);
  await ctx.db.patch(skill._id, patch);
}

async function deleteSkillRecord(
  ctx: MutationCtx,
  skillId: Id<"skills">,
): Promise<void> {
  await deleteVersionsForSkill(ctx, skillId);
  await ctx.db.delete(skillId);
}

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

// the caller's effective skills: enabled personal + installed system skills
export const listEffectiveSkills = authQuery({
  args: {},
  handler: async (ctx): Promise<EffectiveSkill[]> => {
    return await resolveEffectiveSkills(ctx, ctx.userId);
  },
});

export const createSkill = authMutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await requireContentScopeAccess(ctx, ctx.userId, args.teamId);
    const id = await createSkillRecord(ctx, {
      userId: ctx.userId,
      teamId: args.teamId,
      name: args.name,
      description: args.description,
      instructions: args.instructions,
    });
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, args.teamId);
    return id;
  },
});

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

    await applySkillUpdate(ctx, skill, patch, {
      source: "web",
      authorUserId: ctx.userId,
    });
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

export const deleteSkill = authMutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const skill = await resolveSkillOrThrow(ctx, args.id);
    await assertContentDeletable(ctx, skill, ctx.userId);
    await deleteSkillRecord(ctx, skill._id);
    await invalidateContextPromptIfPersonal(ctx, ctx.userId, skill.teamId);
  },
});

export const deleteSkills = authMutation({
  args: { ids: v.array(v.id("skills")) },
  handler: async (ctx, args) => {
    let anyPersonal = false;
    for (const id of args.ids) {
      const skill = await ctx.db.get(id);
      if (!skill) continue;
      await assertContentDeletable(ctx, skill, ctx.userId);
      await deleteSkillRecord(ctx, id);
      if (skill.teamId === undefined) anyPersonal = true;
    }
    if (anyPersonal) {
      await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
    }
  },
});

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

// internal helpers for mcp http routes after jwt verification

export const listEffectiveByClerkIdInternal = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, args): Promise<EffectiveSkill[]> => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) return [];
    return await resolveEffectiveSkills(ctx, user._id);
  },
});

// resolve one effective skill by name for clerkId (personal first, then system)
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

// workspace scoped enabled skills for the memory graph (personal or team)
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

    const id = await createSkillRecord(ctx, {
      userId: user._id,
      name: args.name,
      description: args.description,
      instructions: args.instructions,
    });
    await scheduleContextPromptInvalidationForUser(ctx, user._id);

    const created = await ctx.db.get(id);
    if (!created) {
      throw new Error("Failed to create skill");
    }
    return created;
  },
});

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

    await applySkillUpdate(ctx, skill, patch, {
      source: "mcp",
      authorUserId: user._id,
      force: true,
    });
    await scheduleContextPromptInvalidationForUser(ctx, user._id);

    const updated = await ctx.db.get(skill._id);
    if (!updated) {
      throw new Error("Failed to update skill");
    }
    return updated;
  },
});

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

    await deleteSkillRecord(ctx, skill._id);
    await scheduleContextPromptInvalidationForUser(ctx, user._id);
    return null;
  },
});
