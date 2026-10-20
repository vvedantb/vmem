import { z } from "zod";
import { internal } from "../_generated/api";
import { recommendSkills } from "../../engine/memory/jevSkillRecommend";
import { resolveSystemOneApiKey } from "../lib/systemOneKey";
import { SKILLS_IMPORT_MAX, toSkillIndexEntry } from "../skills";
import { scopedClerk, toolSpec } from "./toolTypes";

const includeDisabledParam = z
  .boolean()
  .optional()
  .describe("Also include disabled skills and installs (default false)");

const skillsListSchema = z.object({ includeDisabled: includeDisabledParam });

const skillsGetSchema = z.object({
  name: z.string().describe("Exact skill name (case sensitive)"),
  includeDisabled: includeDisabledParam,
});

const skillsHistorySchema = z.object({
  name: z.string().describe("Exact skill name (case sensitive)"),
});

const skillVersionSchema = z.object({
  versionId: z.string().describe("Version id from skills_history"),
});

const catalogListSchema = z.object({
  includeInstructions: z
    .boolean()
    .optional()
    .describe(
      "Include each skill's full markdown instructions (default false)",
    ),
});

const systemSkillIdParam = z
  .string()
  .describe("System skill id from skills_catalog_list");

const catalogSkillSchema = z.object({ systemSkillId: systemSkillIdParam });

const catalogSetEnabledSchema = z.object({
  systemSkillId: systemSkillIdParam,
  enabled: z.boolean().describe("true enables the install, false disables it"),
});

const skillsCreateSchema = z.object({
  name: z.string().describe("Unique skill name"),
  description: z
    .string()
    .describe(
      "When to trigger this skill — the repeatable problem or workflow (shown in skills index)",
    ),
  instructions: z
    .string()
    .describe(
      "Markdown playbook: steps, checks, or automation the agent should follow when this skill applies",
    ),
});

const skillsUpdateSchema = z.object({
  name: z.string().describe("Current skill name (exact, case sensitive)"),
  newName: z.string().optional().describe("New unique name (rename)"),
  description: z
    .string()
    .optional()
    .describe("Updated when-to-use description for the skills index"),
  instructions: z.string().optional().describe("Updated markdown playbook"),
  enabled: z
    .boolean()
    .optional()
    .describe("Set false to disable the skill, true to re-enable"),
});

const skillsDeleteSchema = z.object({
  name: z.string().describe("Exact skill name to delete"),
});

const skillsImportSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().describe("Exact skill name (trimmed, unique)"),
        description: z
          .string()
          .describe("When-to-use line for the skills index"),
        instructions: z.string().describe("Full markdown playbook"),
      }),
    )
    .max(SKILLS_IMPORT_MAX)
    .describe("Up to 25 personal skills to upsert (vibot import)"),
});

const skillsRecommendSchema = z.object({
  query: z
    .string()
    .describe("Short task or question to match against enabled skills"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max skills to return (default 8)"),
});

export const skillsToolSpecs = {
  skills_list: toolSpec({
    name: "skills_list",
    schema: skillsListSchema,
    description:
      "List skills granted to this MCP connector: name, description, enabled, source (personal or system), origin (web, mcp or vibot), createdAt and updatedAt. No instructions. Enabled only unless includeDisabled is true (the web Skills page shows both). Personal `/mcp` sees the caller's personal skills; team `/mcp/team` sees only that team's skills. Same index as Available Skills in context_prompt_get / vmem://context_prompt on personal. When a task matches, call skills_recommend or skills_get with the exact name before following a playbook.",
    errorLabel: "List skills failed",
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.skills.listEffectiveByClerkIdInternal,
        { ...scopedClerk(h), includeDisabled: params.includeDisabled },
      );
      return rows.map((row) => ({
        ...toSkillIndexEntry(row),
        enabled: row.enabled,
        source: row.source,
        origin: row.origin ?? null,
        createdAt: row.createdAt ?? null,
      }));
    },
  }),
  skills_import: toolSpec({
    name: "skills_import",
    schema: skillsImportSchema,
    description:
      "Upsert up to 25 personal skills by exact trimmed name. Idempotent. Sets origin to vibot. Personal `/mcp` only — team `/mcp/team` rejects. Empty name/description/instructions rows are skipped. Installed system skill names are skipped. Returns created, updated, skipped counts and the names that exist after the batch.",
    errorLabel: "Import skills failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.skills.importByClerkIdInternal, {
        ...scopedClerk(h),
        items: params.items,
      });
    },
  }),
  skills_recommend: toolSpec({
    name: "skills_recommend",
    schema: skillsRecommendSchema,
    description:
      "Shortlist enabled skills that fit a short task/query. Uses Jev on the AI Gateway when AI_GATEWAY_API_KEY is configured (fail-open to lexical name/description ranking if the key or Jev is unavailable). Returns name + description only; call skills_get for full markdown. Respects personal vs team MCP grants.",
    errorLabel: "Recommend skills failed",
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.skills.listEffectiveByClerkIdInternal,
        scopedClerk(h),
      );
      const apiKey = resolveSystemOneApiKey();
      return recommendSkills({
        query: params.query,
        skills: rows.map(toSkillIndexEntry),
        apiKey,
        limit: params.limit ?? 8,
      });
    },
  }),
  skills_get: toolSpec({
    name: "skills_get",
    schema: skillsGetSchema,
    description:
      "Fetch a single skill granted to this MCP connector by exact name, including full markdown instructions. Enabled skills only unless includeDisabled is true. Call after identifying a matching skill from skills_recommend, skills_list, context_prompt_get, or vmem://skills/<name>.",
    errorLabel: "Get skill failed",
    async run(h, params): Promise<unknown> {
      const skill = await h.ctx.runQuery(
        internal.skills.getEffectiveByNameInternal,
        {
          ...scopedClerk(h),
          name: params.name,
          includeDisabled: params.includeDisabled,
        },
      );
      if (!skill) {
        throw new Error("Skill not found");
      }
      return skill;
    },
  }),
  skills_create: toolSpec({
    name: "skills_create",
    schema: skillsCreateSchema,
    description:
      "Create a new enabled skill in this MCP connector's grant (personal skills on `/mcp`, team skills on `/mcp/team`) when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check skills_list or skills_recommend first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique within the grant (trimmed).",
    errorLabel: "Create skill failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.skills.createByClerkIdInternal, {
        ...scopedClerk(h),
        name: params.name,
        description: params.description,
        instructions: params.instructions,
      });
    },
  }),
  skills_update: toolSpec({
    name: "skills_update",
    schema: skillsUpdateSchema,
    description:
      "Update an existing skill in this MCP connector's grant when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting. Team `/mcp/team` cannot update personal skills and vice versa.",
    errorLabel: "Update skill failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.skills.updateByClerkIdInternal, {
        ...scopedClerk(h),
        name: params.name,
        newName: params.newName,
        description: params.description,
        instructions: params.instructions,
        enabled: params.enabled,
      });
    },
  }),
  skills_delete: toolSpec({
    name: "skills_delete",
    schema: skillsDeleteSchema,
    description:
      "Permanently delete a skill by exact name (case sensitive) in this MCP connector's grant. Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it. Team `/mcp/team` cannot delete personal skills and vice versa.",
    errorLabel: "Delete skill failed",
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(internal.skills.deleteByClerkIdInternal, {
        ...scopedClerk(h),
        name: params.name,
      });
      return { deleted: true };
    },
  }),
  skills_history: toolSpec({
    name: "skills_history",
    schema: skillsHistorySchema,
    description:
      "List saved versions of a skill, newest first (the web History panel): versionId, createdAt, source (web or mcp) and authorLabel. A version is saved before each overwrite. Read one with skills_version_get; roll back with skills_restore_version.",
    errorLabel: "Skill history failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runQuery(internal.skills.listVersionsByClerkIdInternal, {
        ...scopedClerk(h),
        name: params.name,
      });
    },
  }),
  skills_version_get: toolSpec({
    name: "skills_version_get",
    schema: skillVersionSchema,
    description:
      "Read one saved skill version from skills_history: name, description, instructions and enabled as they were then.",
    errorLabel: "Get skill version failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runQuery(internal.skills.getVersionByClerkIdInternal, {
        ...scopedClerk(h),
        versionId: params.versionId,
      });
    },
  }),
  skills_restore_version: toolSpec({
    name: "skills_restore_version",
    schema: skillVersionSchema,
    description:
      "Restore a skill to a saved version from skills_history (name, description, instructions, enabled). The current content is saved as a new version first, so a restore can be undone. Fails if the old name is now used by another skill.",
    errorLabel: "Restore skill version failed",
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(
        internal.skills.restoreVersionByClerkIdInternal,
        { ...scopedClerk(h), versionId: params.versionId },
      );
    },
  }),
  skills_catalog_list: toolSpec({
    name: "skills_catalog_list",
    schema: catalogListSchema,
    description:
      "Browse the vmem system skill hub (curated skills): id, name, description, category, installed and installEnabled for this connector's workspace (personal on `/mcp`, the active team on `/mcp/team`). Install with skills_catalog_install.",
    errorLabel: "List skill catalog failed",
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.systemSkills.listCatalogByClerkIdInternal,
        scopedClerk(h),
      );
      return rows.map((row) => ({
        systemSkillId: row._id,
        name: row.name,
        description: row.description,
        category: row.category ?? null,
        published: row.published,
        updatedAt: row.updatedAt,
        installed: row.installed,
        installEnabled: row.installEnabled,
        ...(params.includeInstructions === true
          ? { instructions: row.instructions }
          : {}),
      }));
    },
  }),
  skills_catalog_install: toolSpec({
    name: "skills_catalog_install",
    schema: catalogSkillSchema,
    description:
      "Install a system skill from skills_catalog_list into this connector's workspace (enabled). Idempotent. Fails if a skill with the same name already exists there.",
    errorLabel: "Install system skill failed",
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(internal.systemSkills.installByClerkIdInternal, {
        ...scopedClerk(h),
        systemSkillId: params.systemSkillId,
      });
      return { systemSkillId: params.systemSkillId, installed: true };
    },
  }),
  skills_catalog_uninstall: toolSpec({
    name: "skills_catalog_uninstall",
    schema: catalogSkillSchema,
    description:
      "Uninstall a system skill from this connector's workspace. Returns uninstalled: false when it was not installed.",
    errorLabel: "Uninstall system skill failed",
    async run(h, params): Promise<unknown> {
      const uninstalled = await h.ctx.runMutation(
        internal.systemSkills.uninstallByClerkIdInternal,
        { ...scopedClerk(h), systemSkillId: params.systemSkillId },
      );
      return { systemSkillId: params.systemSkillId, uninstalled };
    },
  }),
  skills_catalog_set_enabled: toolSpec({
    name: "skills_catalog_set_enabled",
    schema: catalogSetEnabledSchema,
    description:
      "Enable or disable an installed system skill in this connector's workspace without uninstalling it.",
    errorLabel: "Set system skill enabled failed",
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(
        internal.systemSkills.setInstalledEnabledByClerkIdInternal,
        {
          ...scopedClerk(h),
          systemSkillId: params.systemSkillId,
          enabled: params.enabled,
        },
      );
      return { systemSkillId: params.systemSkillId, enabled: params.enabled };
    },
  }),
};
