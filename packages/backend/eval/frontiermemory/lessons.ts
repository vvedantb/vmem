import { z } from "zod";
import {
  AI_GATEWAY_CHAT_MODEL,
  THINKING_OFF,
} from "../../engine/llm/aiGateway.ts";
import { parseJsonString } from "../../engine/llm/extractJsonString.ts";
import type { Episode } from "./episodes.ts";
import {
  callWithBudget,
  mapWithConcurrency,
  readCache,
  writeCache,
  type Budget,
  type LlmClient,
} from "./llm.ts";
import { approxTokens } from "./text.ts";
import { lessonSchema, type Lesson } from "./types.ts";

/** Bump when the prompt changes so cached lessons are not reused. */
const LESSONS_PROMPT_VERSION = 1;
const EXPECTED_OUTPUT_TOKENS = 800;
const MAX_LESSONS_PER_RUN = 8;

export const DEFAULT_LESSON_MODEL = AI_GATEWAY_CHAT_MODEL;

const SYSTEM_PROMPT = `You turn one past AI-agent run into reusable lessons for a memory folder. A future agent reads that folder before it does the same or a similar task. It has no other access to this run.

You see the task prompt, later user messages, the final assistant turns and the verifier result (PASS or FAIL).

Rules:
- Be outcome-aware. If the run FAILED, find what most likely caused the failure and write it as a pitfall ("Do not X; do Y instead"). Do not record a failed run's approach as a procedure unless it is clearly not related to the failure. If the run PASSED, record the steps and checks that made it pass as procedures.
- Later user messages are corrections or preferences. Record each durable one as kind "preference" and keep the exact format or style the user asked for. If it replaces an earlier preference in the same run, put the replaced instruction in "supersedes".
- Write every lesson as one imperative instruction that starts with a verb. Instructions beat summaries.
- Do not include run-specific details: ids, hashes, temp paths, timestamps, random names, or numbers that only hold for this run. Keep stable names a future run will also see, such as file names, config keys, commands and API names.
- scope "task-specific" means it helps only this task. scope "general" means it helps any similar task.
- outcome_link: "led_to_pass", "led_to_fail" or "unclear".
- evidence: a short quote (max 20 words) from the run.
- Give 0 to ${MAX_LESSONS_PER_RUN} lessons. Fewer good lessons beat many weak ones.

Reply with only a JSON array:
[{"lesson": "...", "kind": "procedure|preference|pitfall|fact", "outcome_link": "led_to_pass|led_to_fail|unclear", "scope": "task-specific|general", "evidence": "...", "supersedes": "... or null"}]`;

// Lenient envelope: keep each valid item, drop malformed ones.
const lessonItemsSchema = z.union([
  z.array(z.object({}).passthrough()),
  z
    .object({ lessons: z.array(z.object({}).passthrough()) })
    .transform((value) => value.lessons),
]);

const cachedLessonsSchema = z.object({
  file: z.string(),
  model: z.string(),
  lessons: z.array(lessonSchema),
});

export function parseLessons(text: string): Lesson[] | null {
  const items = parseJsonString(text, lessonItemsSchema);
  if (items === null) return null;
  return items
    .flatMap((item) => {
      const parsed = lessonSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_LESSONS_PER_RUN);
}

/** Token estimate for one lesson call, for --dry-run cost estimates. */
export function estimateLessonCall(episode: Episode): {
  promptTokens: number;
  completionTokens: number;
} {
  return {
    promptTokens: approxTokens(SYSTEM_PROMPT.length + episode.text.length),
    completionTokens: EXPECTED_OUTPUT_TOKENS,
  };
}

interface ExtractLessonsOptions {
  model: string;
  cacheDir: string;
  concurrency: number;
  budget: Budget;
  client: LlmClient;
}

/**
 * One LLM call per episode, cached per run hash + model + prompt version.
 * Results are in episode order.
 * Episodes without lessons (budget cap or bad JSON) get an empty list and
 * are not cached, so a rerun retries them.
 */
export async function extractLessons(
  episodes: readonly Episode[],
  options: ExtractLessonsOptions,
): Promise<Lesson[][]> {
  return mapWithConcurrency(episodes, options.concurrency, async (episode) => {
    const key = `${episode.id}-${options.model.replace(/[^a-z0-9]+/gi, "_")}-v${LESSONS_PROMPT_VERSION}`;
    const cached = readCache(options.cacheDir, key, cachedLessonsSchema);
    if (cached) {
      options.budget.usage.cachedCalls += 1;
      return cached.lessons;
    }
    const text = await callWithBudget(
      options.budget,
      options.client,
      {
        model: options.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: episode.text },
        ],
        temperature: 0.1,
        providerOptions: THINKING_OFF,
      },
      EXPECTED_OUTPUT_TOKENS,
      `lessons:${episode.source}`,
    );
    const lessons = text === null ? null : parseLessons(text);
    if (lessons === null) {
      return [];
    }
    writeCache(options.cacheDir, key, {
      file: episode.source,
      model: options.model,
      lessons,
    });
    return lessons;
  });
}
