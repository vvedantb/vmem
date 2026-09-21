import { z } from "zod";
import { internal } from "../_generated/api";
import { recommendSkills } from "../../engine/memory/jevSkillRecommend";
import { resolveSystemOneApiKey } from "../lib/systemOneKey";
import { toSkillIndexEntry } from "../skills";
import { emptyInputSchema, scopedClerk, toolSpec } from "./toolTypes";

const skillsGetSchema = z.object({
  name: z.string().describe("Exact skill name (case sensitive)"),
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
    schema: emptyInputSchema,
    description:
      "List enabled skills granted to this MCP connector (name + description only). Personal `/mcp` sees the caller's personal skills; team `/mcp/team` sees only that team's skills. Same index as Available Skills in context_prompt_get / vmem://context_prompt on personal. When a task matches, call skills_recommend or skills_get with the exact name before following a playbook.",
    errorLabel: "List skills failed",
    async run(h): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.skills.listEffectiveByClerkIdInternal,
        scopedClerk(h),
      );
      return rows.map(toSkillIndexEntry);
    },
  }),
  skills_recommend: toolSpec({
    name: "skills_recommend",
    schema: skillsRecommendSchema,
    description:
      "Shortlist enabled skills that fit a short task/query. Uses TypeSafe Jev when TYPESAFE_API_KEY is configured (fail-open to lexical name/description ranking if the key or Jev is unavailable). Returns name + description only; call skills_get for full markdown. Respects personal vs team MCP grants.",
    errorLabel: "Recommend skills failed",
    async run(h, params): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.skills.listEffectiveByClerkIdInternal,
        scopedClerk(h),
      );
      const apiKey = await resolveSystemOneApiKey(h.ctx, h.clerkUserId);
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
      "Fetch a single enabled skill granted to this MCP connector by exact name, including full markdown instructions. Call after identifying a matching skill from skills_recommend, skills_list, context_prompt_get, or vmem://skills/<name>.",
    errorLabel: "Get skill failed",
    async run(h, params): Promise<unknown> {
      const skill = await h.ctx.runQuery(
        internal.skills.getEffectiveByNameInternal,
        {
          ...scopedClerk(h),
          name: params.name,
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
};
