import { z } from "zod";
import { internal } from "../_generated/api";
import {
  buildContextPack,
  CONTEXT_PACK_DEFAULT_CHARS,
  CONTEXT_PACK_MAX_CHARS,
  CONTEXT_PACK_MIN_CHARS,
} from "../../engine/memory/contextPack";
import {
  recommendSkills,
  type SkillRecommendResult,
} from "../../engine/memory/jevSkillRecommend";
import { resolveSystemOneApiKey } from "../lib/systemOneKey";
import {
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
} from "../memoryRuntime";
import { toSkillIndexEntry } from "../skills";
import { runForMcpScope, withMcpMemoryScope } from "./memoryScope";
import {
  scopedClerk,
  scopedMemory,
  toolSpec,
  type ToolHandlerContext,
} from "./toolTypes";

const contextPackSchema = z.object({
  task: z
    .string()
    .trim()
    .min(1)
    .describe("The user's current task or question, in a sentence"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to pack memories from (defaults to active profile)"),
  memoryLimit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max memories to retrieve (default 8)"),
  skillLimit: z
    .number()
    .int()
    .min(0)
    .max(8)
    .optional()
    .describe("Max suggested skills (default 3, 0 to skip)"),
  maxChars: z
    .number()
    .int()
    .min(CONTEXT_PACK_MIN_CHARS)
    .max(CONTEXT_PACK_MAX_CHARS)
    .optional()
    .describe(
      `Character budget for the markdown (default ${String(CONTEXT_PACK_DEFAULT_CHARS)})`,
    ),
  referenceDate: z
    .string()
    .optional()
    .describe("ISO date used for last-week / currently temporal scoring"),
});

// skills and profile are extras: a failure drops the section, not the pack
async function packSkills(
  h: ToolHandlerContext,
  task: string,
  limit: number,
): Promise<SkillRecommendResult | null> {
  if (limit === 0) return null;
  try {
    const rows = await h.ctx.runQuery(
      internal.skills.listEffectiveByClerkIdInternal,
      scopedClerk(h),
    );
    return await recommendSkills({
      query: task,
      skills: rows.map(toSkillIndexEntry),
      apiKey: resolveSystemOneApiKey(),
      limit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][context_pack] skills failed:", message);
    return null;
  }
}

async function packProfile(h: ToolHandlerContext): Promise<string | null> {
  if (h.scope === "team") return null;
  try {
    const result = await h.ctx.runAction(
      internal.contextPromptApi.mcpGetContextPrompt,
      { clerkId: h.clerkUserId },
    );
    return result.isPlaceholder ? null : result.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][context_pack] profile failed:", message);
    return null;
  }
}

export const contextToolSpecs = {
  context_pack: toolSpec({
    name: "context_pack",
    schema: contextPackSchema,
    description:
      "One call at task start: returns a budgeted markdown pack with the memories most relevant to the task (same retrieve + Jev rerank as memory_retrieve), the best-fit skills (same as skills_recommend), and the user profile from context_prompt_get (personal connector only). Sections fill in that order until maxChars; memoryIds / skillNames list what was included and truncated flags a cut. Call skills_get before following a suggested skill.",
    errorLabel: "Context pack failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const limit = params.memoryLimit ?? 8;
          const [memories, skills, profile] = await Promise.all([
            runForMcpScope(scope, {
              team: (profileId) =>
                retrieveMemoriesForTeamProfile(h.ctx, {
                  clerkId: scope.clerkId,
                  profileId,
                  query: params.task,
                  limit,
                  referenceDate: params.referenceDate,
                }),
              personal: ({ clerkId, profileId }) =>
                retrieveMemoriesForClerk(h.ctx, {
                  clerkId,
                  profileId,
                  query: params.task,
                  limit,
                  referenceDate: params.referenceDate,
                }),
            }),
            packSkills(h, params.task, params.skillLimit ?? 3),
            packProfile(h),
          ]);
          const pack = buildContextPack({
            task: params.task,
            memories,
            skills: skills?.skills ?? [],
            profile,
            maxChars: params.maxChars ?? CONTEXT_PACK_DEFAULT_CHARS,
          });
          return { ...pack, skillSource: skills?.source ?? null };
        },
      );
    },
  }),
};
