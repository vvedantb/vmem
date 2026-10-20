import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authQuery, authMutation } from "./auth";
import { scheduleContextPromptInvalidationForUser } from "./lib/contextPromptInvalidate";
import {
  RETIRED_SYSTEM_SKILL_NAMES,
  SYSTEM_SKILL_SEEDS,
} from "./prompts/systemSkillSeeds";
import { requireContentScopeAccess } from "./teams/auth";
import { mcpScopeValidator, type McpScope } from "./profiles/mcpAccess";
import { resolveMcpSkillGrant } from "./skills";

async function isAdminUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const user = await ctx.db.get(userId);
  return user?.isAdmin === true;
}

async function requireAdmin(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  if (!(await isAdminUser(ctx, userId))) {
    throw new Error("Admin only");
  }
}

// invalidate the cached mcp context prompt for everyone who installed a skill
async function invalidateInstallers(
  ctx: MutationCtx,
  systemSkillId: Id<"systemSkills">,
): Promise<void> {
  const installs = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_systemSkill", (q) => q.eq("systemSkillId", systemSkillId))
    .collect();
  for (const install of installs) {
    // context prompt is personal only, skip team-scoped installs
    if (install.teamId !== undefined) continue;
    await scheduleContextPromptInvalidationForUser(ctx, install.userId);
  }
}

async function findInstall(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  systemSkillId: Id<"systemSkills">,
  teamId: Id<"teams"> | undefined,
) {
  if (teamId !== undefined) {
    return await ctx.db
      .query("userSystemSkills")
      .withIndex("by_team_systemSkill", (q) =>
        q.eq("teamId", teamId).eq("systemSkillId", systemSkillId),
      )
      .first();
  }
  const matches = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_user_systemSkill", (q) =>
      q.eq("userId", userId).eq("systemSkillId", systemSkillId),
    )
    .collect();
  return matches.find((i) => i.teamId === undefined) ?? null;
}

async function listScopeInstalls(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
) {
  if (teamId !== undefined) {
    return await ctx.db
      .query("userSystemSkills")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  }
  const rows = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.filter((i) => i.teamId === undefined);
}

export const amIAdmin = authQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    return await isAdminUser(ctx, ctx.userId);
  },
});

// Catalogue with install state for the personal or team workspace. Drafts
// are visible to admins only. Shared by the skills hub and MCP.
async function listCatalogForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  teamId: Id<"teams"> | undefined,
) {
  await requireContentScopeAccess(ctx, userId, teamId);
  const admin = await isAdminUser(ctx, userId);
  const all = await ctx.db.query("systemSkills").collect();
  const visible = admin ? all : all.filter((s) => s.published);

  const installs = await listScopeInstalls(ctx, userId, teamId);
  const installBySkill = new Map(installs.map((i) => [i.systemSkillId, i]));

  return visible
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const install = installBySkill.get(s._id);
      return {
        _id: s._id,
        name: s.name,
        description: s.description,
        instructions: s.instructions,
        category: s.category,
        published: s.published,
        updatedAt: s.updatedAt,
        installed: install !== undefined,
        installEnabled: install ? install.enabled : false,
      };
    });
}

async function installSystemSkill(
  ctx: MutationCtx,
  userId: Id<"users">,
  systemSkillId: Id<"systemSkills">,
  teamId: Id<"teams"> | undefined,
): Promise<Id<"userSystemSkills">> {
  await requireContentScopeAccess(ctx, userId, teamId);
  const sys = await ctx.db.get(systemSkillId);
  // hide drafts from nonadmins (treat as not found)
  if (!sys || (!sys.published && !(await isAdminUser(ctx, userId)))) {
    throw new Error("System skill not found");
  }

  const existing = await findInstall(ctx, userId, systemSkillId, teamId);
  if (existing) return existing._id; // already installed — idempotent

  // skills and installs share one effective namespace per workspace
  if (teamId !== undefined) {
    const teamClash = await ctx.db
      .query("skills")
      .withIndex("by_team_name", (q) =>
        q.eq("teamId", teamId).eq("name", sys.name),
      )
      .first();
    if (teamClash) {
      throw new Error(
        `This team already has a skill named "${sys.name}". Rename it before installing this system skill.`,
      );
    }
  } else {
    const personalClash = await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", userId).eq("name", sys.name),
      )
      .filter((q) => q.eq(q.field("teamId"), undefined))
      .first();
    if (personalClash) {
      throw new Error(
        `You already have a personal skill named "${sys.name}". Rename it before installing this system skill.`,
      );
    }
  }

  const id = await ctx.db.insert("userSystemSkills", {
    userId,
    teamId,
    systemSkillId,
    enabled: true,
    installedAt: Date.now(),
  });
  if (teamId === undefined) {
    await scheduleContextPromptInvalidationForUser(ctx, userId);
  }
  return id;
}

async function uninstallSystemSkill(
  ctx: MutationCtx,
  userId: Id<"users">,
  systemSkillId: Id<"systemSkills">,
  teamId: Id<"teams"> | undefined,
): Promise<boolean> {
  await requireContentScopeAccess(ctx, userId, teamId);
  const existing = await findInstall(ctx, userId, systemSkillId, teamId);
  if (!existing) return false;
  await ctx.db.delete(existing._id);
  if (teamId === undefined) {
    await scheduleContextPromptInvalidationForUser(ctx, userId);
  }
  return true;
}

async function setSystemSkillInstallEnabled(
  ctx: MutationCtx,
  userId: Id<"users">,
  systemSkillId: Id<"systemSkills">,
  enabled: boolean,
  teamId: Id<"teams"> | undefined,
): Promise<void> {
  await requireContentScopeAccess(ctx, userId, teamId);
  const existing = await findInstall(ctx, userId, systemSkillId, teamId);
  if (!existing) throw new Error("Not installed");
  await ctx.db.patch(existing._id, { enabled });
  if (teamId === undefined) {
    await scheduleContextPromptInvalidationForUser(ctx, userId);
  }
}

export const listCatalog = authQuery({
  args: { teamId: v.optional(v.id("teams")) },
  handler: async (ctx, args) =>
    listCatalogForUser(ctx, ctx.userId, args.teamId),
});

export const install = authMutation({
  args: {
    systemSkillId: v.id("systemSkills"),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) =>
    installSystemSkill(ctx, ctx.userId, args.systemSkillId, args.teamId),
});

export const uninstall = authMutation({
  args: {
    systemSkillId: v.id("systemSkills"),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    await uninstallSystemSkill(
      ctx,
      ctx.userId,
      args.systemSkillId,
      args.teamId,
    );
  },
});

export const setInstalledEnabled = authMutation({
  args: {
    systemSkillId: v.id("systemSkills"),
    enabled: v.boolean(),
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) =>
    setSystemSkillInstallEnabled(
      ctx,
      ctx.userId,
      args.systemSkillId,
      args.enabled,
      args.teamId,
    ),
});

// MCP: the workspace comes from the connector grant (personal, or the active
// team profile), never from a tool param.

// a malformed id is just "not found"
function requireSystemSkillId(
  ctx: QueryCtx,
  systemSkillId: string,
): Id<"systemSkills"> {
  const id = ctx.db.normalizeId("systemSkills", systemSkillId);
  if (id === null) throw new Error("System skill not found");
  return id;
}

async function requireGrant(
  ctx: QueryCtx,
  clerkId: string,
  scope: McpScope | undefined,
) {
  const grant = await resolveMcpSkillGrant(ctx, clerkId, scope);
  if (!grant) throw new Error("User not found");
  return grant;
}

const mcpCatalogArgs = {
  clerkId: v.string(),
  scope: v.optional(mcpScopeValidator),
};

export const listCatalogByClerkIdInternal = internalQuery({
  args: mcpCatalogArgs,
  handler: async (ctx, args) => {
    const grant = await requireGrant(ctx, args.clerkId, args.scope);
    return listCatalogForUser(ctx, grant.userId, grant.teamId);
  },
});

export const installByClerkIdInternal = internalMutation({
  args: { ...mcpCatalogArgs, systemSkillId: v.string() },
  handler: async (ctx, args) => {
    const grant = await requireGrant(ctx, args.clerkId, args.scope);
    await installSystemSkill(
      ctx,
      grant.userId,
      requireSystemSkillId(ctx, args.systemSkillId),
      grant.teamId,
    );
    return null;
  },
});

export const uninstallByClerkIdInternal = internalMutation({
  args: { ...mcpCatalogArgs, systemSkillId: v.string() },
  handler: async (ctx, args) => {
    const grant = await requireGrant(ctx, args.clerkId, args.scope);
    return uninstallSystemSkill(
      ctx,
      grant.userId,
      requireSystemSkillId(ctx, args.systemSkillId),
      grant.teamId,
    );
  },
});

export const setInstalledEnabledByClerkIdInternal = internalMutation({
  args: { ...mcpCatalogArgs, systemSkillId: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const grant = await requireGrant(ctx, args.clerkId, args.scope);
    await setSystemSkillInstallEnabled(
      ctx,
      grant.userId,
      requireSystemSkillId(ctx, args.systemSkillId),
      args.enabled,
      grant.teamId,
    );
    return null;
  },
});

export const adminCreate = authMutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
    category: v.optional(v.string()),
    published: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const trimmed = args.name.trim();
    if (trimmed.length === 0) throw new Error("Name is required");

    const dup = await ctx.db
      .query("systemSkills")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .first();
    if (dup) throw new Error("A system skill with this name already exists");

    const now = Date.now();
    return await ctx.db.insert("systemSkills", {
      name: trimmed,
      description: args.description,
      instructions: args.instructions,
      category: args.category,
      published: args.published,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminUpdate = authMutation({
  args: {
    id: v.id("systemSkills"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    category: v.optional(v.union(v.string(), v.null())),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const sys = await ctx.db.get(args.id);
    if (!sys) throw new Error("System skill not found");

    const patch: {
      name?: string;
      description?: string;
      instructions?: string;
      category?: string;
      published?: boolean;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      const trimmed = args.name.trim();
      if (trimmed.length === 0) throw new Error("Name is required");
      if (trimmed !== sys.name) {
        const dup = await ctx.db
          .query("systemSkills")
          .withIndex("by_name", (q) => q.eq("name", trimmed))
          .first();
        if (dup) {
          throw new Error("A system skill with this name already exists");
        }
      }
      patch.name = trimmed;
    }
    if (args.description !== undefined) patch.description = args.description;
    if (args.instructions !== undefined) {
      patch.instructions = args.instructions;
    }
    if (args.category !== undefined) {
      patch.category = args.category === null ? undefined : args.category;
    }
    if (args.published !== undefined) patch.published = args.published;

    await ctx.db.patch(args.id, patch);
    await invalidateInstallers(ctx, args.id);
  },
});

async function deleteSystemSkillRow(
  ctx: MutationCtx,
  systemSkillId: Id<"systemSkills">,
): Promise<void> {
  const installs = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_systemSkill", (q) => q.eq("systemSkillId", systemSkillId))
    .collect();
  await invalidateInstallers(ctx, systemSkillId);
  for (const install of installs) {
    await ctx.db.delete(install._id);
  }
  await ctx.db.delete(systemSkillId);
}

export const adminDelete = authMutation({
  args: { id: v.id("systemSkills") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    await deleteSystemSkillRow(ctx, args.id);
  },
});

export const seedSystemSkillsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const name of RETIRED_SYSTEM_SKILL_NAMES) {
      const retired = await ctx.db
        .query("systemSkills")
        .withIndex("by_name", (q) => q.eq("name", name))
        .first();
      if (retired) await deleteSystemSkillRow(ctx, retired._id);
    }
    for (const seed of SYSTEM_SKILL_SEEDS) {
      const existing = await ctx.db
        .query("systemSkills")
        .withIndex("by_name", (q) => q.eq("name", seed.name))
        .first();
      if (existing) {
        // keep published seeds in sync with the repo definition
        if (existing.published) {
          await ctx.db.patch(existing._id, {
            description: seed.description,
            instructions: seed.instructions,
            category: seed.category,
            updatedAt: Date.now(),
          });
        }
        continue;
      }
      const now = Date.now();
      await ctx.db.insert("systemSkills", {
        name: seed.name,
        description: seed.description,
        instructions: seed.instructions,
        category: seed.category,
        published: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { seeded: SYSTEM_SKILL_SEEDS.length };
  },
});
