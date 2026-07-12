import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import {
  buildLocalChatSystemPrompt,
  type SkillPromptEntry,
} from "@vmem/shared";

/** One memory pulled by retrieval and surfaced in a chat bubble (shape = `chatMessageMemoryRefs.refs[number]`). */
export type ChatMemoryRef = FunctionReturnType<
  typeof api.chat.getThreadMessageMemoryRefs
>[string][number];

type RetrieveMemoriesResult = FunctionReturnType<
  typeof api.memoryApi.retrieveMemories
>;

export const RETRIEVE_LIMIT = 8;

/**
 * Retrieve relevant memories and assemble the grounded system prompt.
 * Shared by local chat and voice (which pass different `core` prompts).
 * Retrieval failure is non-fatal: falls back to a prompt with no candidates.
 */
export async function buildGroundedPrompt({
  core,
  query,
  skills,
  retrieve,
}: {
  core: string;
  query: string;
  skills: SkillPromptEntry[];
  retrieve: (args: {
    query: string;
    limit: number;
  }) => Promise<RetrieveMemoriesResult>;
}): Promise<{ systemPrompt: string; memoryRefs: ChatMemoryRef[] }> {
  try {
    const retrieved = await retrieve({ query, limit: RETRIEVE_LIMIT });
    const memoryRefs: ChatMemoryRef[] = retrieved.memories.map((m) => ({
      id: m.id,
      title: m.title,
      trace: {
        score: m.trace.score,
        scoreBreakdown: m.trace.scoreBreakdown,
        reason: m.trace.reason,
      },
    }));
    const systemPrompt = buildLocalChatSystemPrompt({
      core,
      memoryCandidates: retrieved.memories.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content,
        trace: { reason: m.trace.reason },
      })),
      skills,
      userMessage: query,
    });
    return { systemPrompt, memoryRefs };
  } catch (retrieveError) {
    console.error("retrieveMemories failed:", retrieveError);
    const systemPrompt = buildLocalChatSystemPrompt({
      core,
      memoryCandidates: [],
      skills,
      userMessage: query,
    });
    return { systemPrompt, memoryRefs: [] };
  }
}
