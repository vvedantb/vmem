import { z } from "zod";
import { internal } from "../_generated/api";
import { toSkillIndexEntry } from "../skills";
import { toolSpec } from "./toolTypes";

const skillsListSchema = z.object({});

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

export const skillsToolSpecs = {
  skills_list: toolSpec({
    name: "skills_list",
    schema: skillsListSchema,
    description:
      "List enabled skills (name + description only). Same data as the Available Skills section in context_prompt_get / vmem://context_prompt. When a task matches a skill's description, call skills_get with the exact name to load full markdown instructions before following them.",
    errorLabel: "List skills failed",
    scopes: ["personal"],
    async run(h): Promise<unknown> {
      const rows = await h.ctx.runQuery(
        internal.skills.listEffectiveByClerkIdInternal,
        { clerkId: h.clerkUserId },
      );
      return rows.map(toSkillIndexEntry);
    },
  }),
  skills_get: toolSpec({
    name: "skills_get",
    schema: skillsGetSchema,
    description:
      "Fetch a single enabled skill by exact name, including full markdown instructions. Call after identifying a matching skill from context_prompt_get, skills_list, or the Available Skills section in vmem://context_prompt.",
    errorLabel: "Get skill failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runQuery(internal.skills.getEffectiveByNameInternal, {
        clerkId: h.clerkUserId,
        name: params.name,
      });
    },
  }),
  skills_create: toolSpec({
    name: "skills_create",
    schema: skillsCreateSchema,
    description:
      "Create a new enabled skill when you have identified a repeatable problem or a workflow that could be automated with a skill, and no existing skill already covers it (check Available Skills in vmem://context_prompt or call skills_list first). Write markdown instructions so future sessions can follow the same fix or automation. Do not create duplicates — if a similar skill exists, use skills_get and skills_update instead. Names must be unique per user (trimmed).",
    errorLabel: "Create skill failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.skills.createByClerkIdInternal, {
        clerkId: h.clerkUserId,
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
      "Update an existing skill when its playbook should change — e.g. after fixing a repeatable problem, refining steps, or improving an automation. Call skills_get first to read the current skill. Provide the skill's current exact name (case sensitive) plus at least one field to change. Use newName to rename; use enabled false to disable without deleting.",
    errorLabel: "Update skill failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      return h.ctx.runMutation(internal.skills.updateByClerkIdInternal, {
        clerkId: h.clerkUserId,
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
      "Permanently delete a skill by exact name (case sensitive). Call skills_get first if unsure of the name. Prefer skills_update with enabled false to hide a skill without deleting it.",
    errorLabel: "Delete skill failed",
    scopes: ["personal"],
    async run(h, params): Promise<unknown> {
      await h.ctx.runMutation(internal.skills.deleteByClerkIdInternal, {
        clerkId: h.clerkUserId,
        name: params.name,
      });
      return { deleted: true };
    },
  }),
};
