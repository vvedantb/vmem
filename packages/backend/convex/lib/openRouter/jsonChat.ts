/**
 * JSON-mode chat wrapper. Centralises the pattern shared by every
 * reasoning call (enrichment, fact extraction, dream synthesis, entity
 * backfill, agent): pick the shared model, prepend the "respond with
 * ONLY valid JSON" system instruction, fire one completion, return the
 * raw string for the caller to parse.
 *
 * Callers own only their domain prompt (and an optional domain `role`
 * line) plus response parsing — the model default and the JSON
 * instruction live here so a change propagates everywhere at once.
 */

import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { callOpenRouterChat } from "./chat";
import { LLM_MODEL, type OpenRouterFeature } from "./shared";

/** Shared instruction appended after any domain `role` line. */
const JSON_SYSTEM_INSTRUCTION =
  "Respond with ONLY valid JSON. No thinking, no markdown, no commentary.";

export interface JsonChatArgs {
  apiKey: string;
  userId: Id<"users">;
  profileId?: string;
  feature: OpenRouterFeature;
  /** The domain prompt (the `user` message). */
  prompt: string;
  /**
   * Optional domain role sentence prepended to the JSON instruction,
   * e.g. "You are a memory-graph synthesis system." Omit for a bare
   * JSON-only system prompt.
   */
  role?: string;
  /** Defaults to {@link LLM_MODEL}. */
  model?: string;
  /** Defaults to 0.1. */
  temperature?: number;
}

/**
 * Fire one JSON-mode chat completion and return the raw content string
 * (or `null` when the call failed / produced no parseable content).
 */
export async function callJsonChat(
  ctx: ActionCtx,
  args: JsonChatArgs,
): Promise<string | null> {
  const system = args.role
    ? `${args.role} ${JSON_SYSTEM_INSTRUCTION}`
    : JSON_SYSTEM_INSTRUCTION;

  const { content } = await callOpenRouterChat(ctx, {
    apiKey: args.apiKey,
    userId: args.userId,
    profileId: args.profileId,
    feature: args.feature,
    model: args.model ?? LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: args.prompt },
    ],
    temperature: args.temperature ?? 0.1,
  });

  return content;
}
