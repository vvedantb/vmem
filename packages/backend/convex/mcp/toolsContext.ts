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
  type SkillIndexSlice,
  type SkillRecommendResult,
} from "../../engine/memory/jevSkillRecommend";
import {
  buildRecallContext,
  clampRecallTokens,
  matchRecallSkills,
  profileFacts,
  rankRecallMemories,
  RECALL_MAX_TOKENS,
  RECALL_MIN_TOKENS,
  RECALL_RETRIEVE_LIMIT,
} from "../../engine/memory/recallContext";
import {
  classifyQueryTemporal,
  parseReferenceMs,
} from "../../engine/memory/temporal";
import { loggedJevEvaluate, resolveSystemOneApiKey } from "../lib/systemOneKey";
import {
  retrieveMemoriesForClerk,
  retrieveMemoriesForTeamProfile,
  type RetrieveTiming,
} from "../memoryRuntime";
import { enqueueMemoryAccess } from "../memoryUsefulness";
import { toSkillIndexEntry } from "../skills";
import {
  runForMcpScope,
  withMcpMemoryScope,
  type McpResolvedScope,
} from "./memoryScope";
import { toPeriodSummary } from "./toolsMemory";
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
      evaluate: loggedJevEvaluate(h.ctx, { clerkId: h.clerkUserId }),
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

const PERIOD_SUMMARY_CAP = 3;

// stored rollups for a task that names a time ("last week", a date); one
// indexed read, no LLM. Null for other tasks, so the pack keeps its shape.
async function packPeriodSummaries(
  h: ToolHandlerContext,
  scope: McpResolvedScope,
  task: string,
  referenceDate: string | undefined,
): Promise<ReturnType<typeof toPeriodSummary>[] | null> {
  const intent = classifyQueryTemporal(
    task,
    parseReferenceMs(referenceDate, Date.now()),
  );
  if (intent.kind !== "window") return null;
  try {
    const { rollups } = await h.ctx.runQuery(
      internal.rollups.getRollupsInternal,
      {
        clerkId: scope.clerkId,
        profileId: scope.profileId,
        startMs: intent.startMs,
        endMs: intent.endMs,
        limit: PERIOD_SUMMARY_CAP,
      },
    );
    return rollups.length === 0 ? null : rollups.map(toPeriodSummary);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][context_pack] period summaries failed:", message);
    return null;
  }
}

const recallContextSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1)
    .describe("The user's current message or task, as written"),
  profileId: z
    .string()
    .optional()
    .describe("Profile ID to recall from (defaults to active profile)"),
  maxTokens: z
    .number()
    .int()
    .optional()
    .describe(
      `Token budget for the text, ~4 chars a token (default 1500, clamped to ${String(RECALL_MIN_TOKENS)}..${String(RECALL_MAX_TOKENS)})`,
    ),
});

// lexical match with a relevance floor: no Jev call on every turn
async function recallSkills(
  h: ToolHandlerContext,
  message: string,
): Promise<SkillIndexSlice[]> {
  try {
    const rows = await h.ctx.runQuery(
      internal.skills.listEffectiveByClerkIdInternal,
      scopedClerk(h),
    );
    return matchRecallSkills(message, rows.map(toSkillIndexEntry));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][recall_context] skills failed:", message);
    return [];
  }
}

// cached context prompt only: unlike context_pack, never schedules a
// regeneration, so a per-turn call adds no LLM work
async function recallProfile(h: ToolHandlerContext): Promise<string | null> {
  if (h.scope === "team") return null;
  try {
    const cache = await h.ctx.runQuery(
      internal.contextPromptCache.getByClerkIdInternal,
      { clerkId: h.clerkUserId },
    );
    return cache === null || cache.generatedAt === 0 ? null : cache.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn("[MCP][recall_context] profile failed:", message);
    return null;
  }
}

// the result and how long it took, for the recall_context timing line
async function measured<T>(run: () => Promise<T>): Promise<[T, number]> {
  const startedAt = Date.now();
  const result = await run();
  return [result, Date.now() - startedAt];
}

export const contextToolSpecs = {
  recall_context: toolSpec({
    name: "recall_context",
    schema: recallContextSchema,
    description:
      "Call at the start of every turn with the user's message. Returns a compact text block (default 1500 tokens, ~4 chars a token) with the most relevant memories (hybrid search, no LLM rerank; browsing-history page visits rank last), the 'Use when' lines of skills that match on their name or 2+ meaningful words, and a few profile facts (personal connector only), filled in that order until maxTokens. Prior versions of changed facts are left out. counts has memories, skills, facts and approxTokens; memoryIds / skillNames list what was included and truncated flags a cut. Use context_pack for a larger pack at task start.",
    errorLabel: "Recall context failed",
    async run(h, params): Promise<unknown> {
      const startedAt = Date.now();
      const timing: RetrieveTiming = {};
      let scopeMs = 0;
      // judge "off": no Jev gate (an LLM call) on a per-turn tool
      const retrieve: {
        query: string;
        limit: number;
        judge: "off";
        timing: RetrieveTiming;
      } = {
        query: params.message,
        limit: RECALL_RETRIEVE_LIMIT,
        judge: "off",
        timing,
      };
      // skills and profile do not need the resolved profile, so they start
      // with the scope read instead of after it
      const [[memories, retrieveMs], [skills, skillsMs], [profile, profileMs]] =
        await Promise.all([
          measured(() =>
            withMcpMemoryScope(
              h.ctx,
              { ...scopedMemory(h), profileId: params.profileId },
              (scope) => {
                scopeMs = Date.now() - startedAt;
                return runForMcpScope(scope, {
                  team: (profileId) =>
                    retrieveMemoriesForTeamProfile(h.ctx, {
                      clerkId: scope.clerkId,
                      profileId,
                      ...retrieve,
                    }),
                  personal: ({ clerkId, profileId }) =>
                    retrieveMemoriesForClerk(h.ctx, {
                      clerkId,
                      profileId,
                      ...retrieve,
                    }),
                });
              },
            ),
          ),
          measured(() => recallSkills(h, params.message)),
          measured(() => recallProfile(h)),
        ]);
      const recall = buildRecallContext({
        message: params.message,
        memories: rankRecallMemories(memories),
        skills,
        facts: profileFacts(profile),
        maxTokens: clampRecallTokens(params.maxTokens),
      });
      await enqueueMemoryAccess(h.ctx, recall.memoryIds, "contextPack");
      // durations only: no query text, ids or memory content. Stages overlap:
      // retrieveMs includes scopeMs; totalMs is the wall-clock of the call
      console.log(
        "[MCP][recall_context][timing]",
        JSON.stringify({
          scopeMs,
          ...timing,
          retrieveMs,
          skillsMs,
          profileMs,
          totalMs: Date.now() - startedAt,
        }),
      );
      return recall;
    },
  }),
  context_pack: toolSpec({
    name: "context_pack",
    schema: contextPackSchema,
    description:
      "One call at task start: returns a budgeted markdown pack with the memories most relevant to the task (same retrieve + Jev rerank as memory_retrieve), the best-fit skills (same as skills_recommend), and the user profile from context_prompt_get (personal connector only). When the task names a time window (yesterday, last week, a date), periodSummaries adds up to 3 stored rollup summaries for it (see memory_timeline). Sections fill in that order until maxChars; memoryIds / skillNames list what was included and truncated flags a cut. Call skills_get before following a suggested skill.",
    errorLabel: "Context pack failed",
    async run(h, params): Promise<unknown> {
      return withMcpMemoryScope(
        h.ctx,
        { ...scopedMemory(h), profileId: params.profileId },
        async (scope) => {
          const limit = params.memoryLimit ?? 8;
          const [memories, skills, profile, periodSummaries] =
            await Promise.all([
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
              packPeriodSummaries(h, scope, params.task, params.referenceDate),
            ]);
          const pack = buildContextPack({
            task: params.task,
            memories,
            skills: skills?.skills ?? [],
            profile,
            maxChars: params.maxChars ?? CONTEXT_PACK_DEFAULT_CHARS,
          });
          await enqueueMemoryAccess(h.ctx, pack.memoryIds, "contextPack");
          return {
            ...pack,
            skillSource: skills?.source ?? null,
            ...(periodSummaries === null ? {} : { periodSummaries }),
          };
        },
      );
    },
  }),
};
