"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { MemoryService } from "../src/neo4j/memoryService";
import { getDriver } from "../src/neo4j/driver";
import { tryUserEnvVarByClerkId } from "./lib/envVars";

/**
 * Regenerates the cached `vmem://context_prompt` markdown for one user.
 *
 * The cache is a synthesized "User Profile" — userSettings (aboutMe +
 * preferences) + top pinned memories verbatim + an LLM-generated short
 * prose summary of recent active memories. AI clients (Claude, Cursor)
 * read this once at conversation start so they don't have to fan out
 * into N tool calls just to learn who the user is.
 *
 * Best-effort. If the LLM is unavailable or has no key, the cache still
 * gets the deterministic sections (about, preferences, pinned) — the
 * "Profile Summary" prose is just omitted. AI clients still get useful
 * data.
 *
 * Triggered by:
 * - `regenerateIfPendingInternal` after a 60s debounce window
 * - `getContextPrompt` on first call when no cache row exists yet
 */

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const LLM_MODEL = "qwen/qwen3-235b-a22b-2507";

/** Number of pinned memories to embed verbatim in the prompt. */
const PINNED_LIMIT = 20;
/** Number of recent active memories the summarizer model sees. */
const RECENT_LIMIT = 50;
/** Per-memory char cap when feeding the summarizer — keeps prompt finite. */
const RECENT_CONTENT_CHAR_CAP = 400;

/** Same OpenRouter response shape extractor used everywhere else. */
function extractLLMContent(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const choices = Reflect.get(json, "choices");
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  const message: unknown = Reflect.get(first, "message");
  if (typeof message !== "object" || message === null) return undefined;
  const content: unknown = Reflect.get(message, "content");
  return typeof content === "string" ? content : undefined;
}

interface MemorySnippet {
  title: string;
  content: string;
}

function formatPinnedSection(pinned: MemorySnippet[]): string {
  if (pinned.length === 0) return "_No pinned memories._";
  return pinned
    .map((m, idx) => `${String(idx + 1)}. **${m.title}** — ${m.content}`)
    .join("\n");
}

function buildSummaryPrompt(recent: MemorySnippet[]): string {
  // Truncate per-memory content so a chatty user doesn't blow the
  // prompt budget. The summarizer is just looking for themes anyway.
  const lines = recent.map((m) => {
    const trimmed =
      m.content.length > RECENT_CONTENT_CHAR_CAP
        ? `${m.content.slice(0, RECENT_CONTENT_CHAR_CAP)}…`
        : m.content;
    return `- ${m.title}: ${trimmed}`;
  });
  return [
    "You are summarizing a user's recent memory state for an AI assistant.",
    "Output ONE short paragraph (<= 200 words) of plain prose describing",
    "themes, ongoing projects, recurring people/tools, and current focus.",
    "Do NOT list memories. Do NOT invent facts not present in the inputs.",
    "Do NOT include preamble, headers, or markdown — just the paragraph.",
    "",
    "Recent memories:",
    ...lines,
  ].join("\n");
}

async function callSummarizer(
  apiKey: string,
  recent: MemorySnippet[],
): Promise<string | null> {
  if (recent.length === 0) return null;
  try {
    const res = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vmem.vedantb.com",
        "X-Title": "vmem",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write concise prose summaries. Plain text only, no markdown.",
          },
          { role: "user", content: buildSummaryPrompt(recent) },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      console.warn(`[context-prompt] summarizer HTTP ${String(res.status)}`);
      return null;
    }
    const json: unknown = await res.json();
    const content = extractLLMContent(json);
    return content ? content.trim() : null;
  } catch (err) {
    console.warn("[context-prompt] summarizer call failed", err);
    return null;
  }
}

/**
 * Build a fresh context-prompt markdown for a user and persist it. Always
 * tries the deterministic sections (settings + pinned) first; only the
 * LLM prose summary depends on a working API key.
 */
export const regenerateContextPromptInternal = internalAction({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Resolve clerkId → users._id so we can read userSettings (which is
    // keyed on the internal id). The internal query already handles the
    // missing-row case by returning empty strings.
    const userId = await ctx.runQuery(
      internal.contextPromptCache.resolveUserIdByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    if (!userId) {
      console.warn(
        `[context-prompt] no user for clerkId=${args.clerkId}, skipping`,
      );
      return null;
    }

    const settings = await ctx.runQuery(
      internal.userSettings.getUserContextInternal,
      { userId },
    );

    const service = new MemoryService(getDriver());

    // Pull pinned (verbatim) and recent (for summarizer). Two cheap
    // index-backed Cypher calls — no fanout per memory.
    const pinnedPage = await service.listMemories({
      userId: args.clerkId,
      status: "pinned",
      limit: PINNED_LIMIT,
      offset: 0,
    });
    const recentPage = await service.listMemories({
      userId: args.clerkId,
      limit: RECENT_LIMIT,
      offset: 0,
    });

    const pinnedSnippets: MemorySnippet[] = pinnedPage.memories.map((m) => ({
      title: m.title,
      content: m.content,
    }));
    const recentSnippets: MemorySnippet[] = recentPage.memories.map((m) => ({
      title: m.title,
      content: m.content,
    }));

    // Profile summary is best-effort. Without an OpenRouter key we still
    // produce a useful prompt (about/preferences/pinned).
    const apiKey = await tryUserEnvVarByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    const summary = apiKey
      ? await callSummarizer(apiKey, recentSnippets)
      : null;

    const sections: string[] = [];
    sections.push("# vmem User Profile");
    sections.push("");
    sections.push("## About");
    sections.push(settings.aboutMe ?? "_(not provided)_");
    sections.push("");
    sections.push("## Preferences");
    sections.push(settings.preferences ?? "_(not provided)_");
    sections.push("");
    sections.push("## Pinned Memories");
    sections.push(formatPinnedSection(pinnedSnippets));
    sections.push("");
    sections.push("## Profile Summary");
    sections.push(summary ?? "_(summary unavailable)_");

    const content = sections.join("\n");

    await ctx.runMutation(internal.contextPromptCache.upsertByClerkIdInternal, {
      clerkId: args.clerkId,
      content,
      memoryCount: recentPage.total,
    });

    console.log(
      `[context-prompt] regenerated for ${args.clerkId} ` +
        `(${String(pinnedSnippets.length)} pinned, ${String(recentSnippets.length)} recent, ` +
        `summary=${summary ? "yes" : "no"})`,
    );
    return null;
  },
});

/**
 * Debounce check fired ~60s after a memory write. Reads the cache flag;
 * only regenerates when the user has actually invalidated since the
 * last regen. Spurious checks are cheap (one read).
 */
export const regenerateIfPendingInternal = internalAction({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cache = await ctx.runQuery(
      internal.contextPromptCache.getByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    if (!cache || !cache.pendingRegeneration) {
      // Either no cache row yet (someone else's regen is already running)
      // or the flag was cleared by an earlier debounce winner.
      return null;
    }
    await ctx.runAction(
      internal.contextPromptActions.regenerateContextPromptInternal,
      { clerkId: args.clerkId },
    );
    return null;
  },
});
