import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authQuery, authMutation, getUserByClerkId } from "./auth";
import { scheduleContextPromptInvalidationForUser } from "./lib/contextPromptInvalidate";
import { SYSTEM_SKILL_SEEDS } from "./prompts/systemSkillSeeds";

/**
 * System skills — the maintainer-curated catalog behind the Skills Hub.
 *
 * A `systemSkills` row is GLOBAL (no userId/teamId). Users INSTALL a link to
 * it (`userSystemSkills`) rather than copying it, so a maintainer edit
 * propagates to every installer instantly (the content always resolves live
 * from the catalog — see `skills.resolveEffectiveSkills`). Catalog CRUD is
 * gated by `users.isAdmin`. Installs are user-wide (personal), matching the
 * MCP personal-only model.
 */

// --- Admin gate ---

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

/** Invalidate the cached MCP context prompt for everyone who installed a skill. */
async function invalidateInstallers(
  ctx: MutationCtx,
  systemSkillId: Id<"systemSkills">,
): Promise<void> {
  const installs = await ctx.db
    .query("userSystemSkills")
    .withIndex("by_systemSkill", (q) => q.eq("systemSkillId", systemSkillId))
    .collect();
  for (const install of installs) {
    await scheduleContextPromptInvalidationForUser(ctx, install.userId);
  }
}

// --- Read ---

/** Whether the current user is a maintainer (gates Hub admin controls). */
export const amIAdmin = authQuery({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    return await isAdminUser(ctx, ctx.userId);
  },
});

/**
 * The Hub catalog for the current user: published rows (plus drafts for
 * admins), annotated with whether the caller has installed each and whether
 * that install is enabled.
 */
export const listCatalog = authQuery({
  args: {},
  handler: async (ctx) => {
    const admin = await isAdminUser(ctx, ctx.userId);
    const all = await ctx.db.query("systemSkills").collect();
    const visible = admin ? all : all.filter((s) => s.published);

    const installs = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_user", (q) => q.eq("userId", ctx.userId))
      .collect();
    const installByskill = new Map(installs.map((i) => [i.systemSkillId, i]));

    return visible
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => {
        const install = installByskill.get(s._id);
        return {
          _id: s._id,
          name: s.name,
          description: s.description,
          instructions: s.instructions,
          category: s.category,
          published: s.published,
          updatedAt: s.updatedAt,
          installed: install !== undefined,
          installEnabled: install ? install.enabled !== false : false,
        };
      });
  },
});

// --- Install / uninstall / toggle (any authenticated user) ---

/** Install (link) a system skill into the caller's personal skills. Idempotent. */
export const install = authMutation({
  args: { systemSkillId: v.id("systemSkills") },
  handler: async (ctx, args) => {
    const sys = await ctx.db.get(args.systemSkillId);
    // Hide drafts from non-admins (treat as not found).
    if (!sys || (!sys.published && !(await isAdminUser(ctx, ctx.userId)))) {
      throw new Error("System skill not found");
    }

    const existing = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_user_systemSkill", (q) =>
        q.eq("userId", ctx.userId).eq("systemSkillId", args.systemSkillId),
      )
      .first();
    if (existing) return existing._id; // already installed — idempotent

    // Personal skills and installs share one effective namespace, so a
    // personal skill of the same name would clash on resolution.
    const personalClash = await ctx.db
      .query("skills")
      .withIndex("by_user_name", (q) =>
        q.eq("userId", ctx.userId).eq("name", sys.name),
      )
      .filter((q) => q.eq(q.field("teamId"), undefined))
      .first();
    if (personalClash) {
      throw new Error(
        `You already have a personal skill named "${sys.name}". Rename it before installing this system skill.`,
      );
    }

    const id = await ctx.db.insert("userSystemSkills", {
      userId: ctx.userId,
      systemSkillId: args.systemSkillId,
      enabled: true,
      installedAt: Date.now(),
    });
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
    return id;
  },
});

/** Remove the caller's install link. No-op if not installed. */
export const uninstall = authMutation({
  args: { systemSkillId: v.id("systemSkills") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_user_systemSkill", (q) =>
        q.eq("userId", ctx.userId).eq("systemSkillId", args.systemSkillId),
      )
      .first();
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
  },
});

/** Enable/disable an install without removing it. */
export const setInstalledEnabled = authMutation({
  args: { systemSkillId: v.id("systemSkills"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_user_systemSkill", (q) =>
        q.eq("userId", ctx.userId).eq("systemSkillId", args.systemSkillId),
      )
      .first();
    if (!existing) throw new Error("Not installed");
    await ctx.db.patch(existing._id, { enabled: args.enabled });
    await scheduleContextPromptInvalidationForUser(ctx, ctx.userId);
  },
});

// --- Admin catalog CRUD (users.isAdmin only) ---

export const adminCreate = authMutation({
  args: {
    name: v.string(),
    description: v.string(),
    instructions: v.string(),
    category: v.optional(v.string()),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const name = args.name.trim();
    if (name.length === 0) throw new Error("Name is required");
    const dup = await ctx.db
      .query("systemSkills")
      .withIndex("by_name", (q) => q.eq("name", name))
      .first();
    if (dup) throw new Error("A system skill with this name already exists");

    const now = Date.now();
    return await ctx.db.insert("systemSkills", {
      name,
      description: args.description,
      instructions: args.instructions,
      category: args.category,
      published: args.published ?? false,
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
    category: v.optional(v.string()),
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

    // The skills index injected into prompts shows name + description, and
    // the Hub hides drafts — so a change to any of those must refresh every
    // installer's cached context prompt. Instructions resolve live (no cache).
    let indexChanged = false;

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) throw new Error("Name is required");
      if (name !== sys.name) {
        const dup = await ctx.db
          .query("systemSkills")
          .withIndex("by_name", (q) => q.eq("name", name))
          .first();
        if (dup) {
          throw new Error("A system skill with this name already exists");
        }
        patch.name = name;
        indexChanged = true;
      }
    }
    if (
      args.description !== undefined &&
      args.description !== sys.description
    ) {
      patch.description = args.description;
      indexChanged = true;
    }
    if (args.instructions !== undefined) patch.instructions = args.instructions;
    if (args.category !== undefined) patch.category = args.category;
    if (args.published !== undefined && args.published !== sys.published) {
      patch.published = args.published;
      indexChanged = true;
    }

    await ctx.db.patch(args.id, patch);
    if (indexChanged) await invalidateInstallers(ctx, args.id);
  },
});

export const adminDelete = authMutation({
  args: { id: v.id("systemSkills") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, ctx.userId);
    const installs = await ctx.db
      .query("userSystemSkills")
      .withIndex("by_systemSkill", (q) => q.eq("systemSkillId", args.id))
      .collect();
    for (const install of installs) {
      await ctx.db.delete(install._id);
      await scheduleContextPromptInvalidationForUser(ctx, install.userId);
    }
    await ctx.db.delete(args.id);
  },
});

// --- Maintenance (run via `npx convex run`) ---

/**
 * Idempotently upsert the shipped catalog seeds. Matches by `name`, falling
 * back to `previousNames` so a renamed seed adopts (renames) the existing row
 * in place — its id and every install survive — instead of orphaning it.
 */
export const seedSystemSkillsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (const seed of SYSTEM_SKILL_SEEDS) {
      let existing = await ctx.db
        .query("systemSkills")
        .withIndex("by_name", (q) => q.eq("name", seed.name))
        .first();

      // No row under the current name — adopt one under a former name (rename).
      if (!existing && seed.previousNames) {
        for (const prev of seed.previousNames) {
          const legacy = await ctx.db
            .query("systemSkills")
            .withIndex("by_name", (q) => q.eq("name", prev))
            .first();
          if (legacy) {
            existing = legacy;
            break;
          }
        }
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: seed.name, // applies the rename when adopted under a former name
          description: seed.description,
          instructions: seed.instructions,
          category: seed.category,
          published: true,
          updatedAt: now,
        });
        await invalidateInstallers(ctx, existing._id);
      } else {
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
    }
    return { seeded: SYSTEM_SKILL_SEEDS.length };
  },
});

/** Grant/revoke the maintainer flag by Clerk id (run via `npx convex run`). */
export const setAdminByClerkIdInternal = internalMutation({
  args: { clerkId: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getUserByClerkId(ctx, args.clerkId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { isAdmin: args.isAdmin });
    return { ok: true };
  },
});
