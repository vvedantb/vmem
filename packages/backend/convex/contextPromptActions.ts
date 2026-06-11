"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { listMemories } from "../engine/neo4j/memory/crud";
import { getDriver } from "../engine/neo4j/driver";
import { buildSkillsIndexAddition } from "@vmem/shared";
import { tryUserAndApiKeyByClerkId } from "./lib/envVars";
import { callOpenRouterChat, LLM_MODEL } from "./lib/openRouter";

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

/** Number of pinned memories to embed verbatim in the prompt. */
const PINNED_LIMIT = 20;
/** Number of recent active memories the summarizer model sees. */
const RECENT_LIMIT = 50;
/** Per-memory char cap when feeding the summarizer — keeps prompt finite. */
const RECENT_CONTENT_CHAR_CAP = 400;

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
  ctx: ActionCtx,
  apiKey: string,
  userId: Id<"users">,
  recent: MemorySnippet[],
): Promise<string | null> {
  if (recent.length === 0) return null;
  try {
    const { content } = await callOpenRouterChat(ctx, {
      apiKey,
      userId,
      // No profileId — context-prompt cache is a single user-wide row,
      // not bound to any one profile.
      feature: "context-prompt",
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
    });
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

    const driver = getDriver();

    // Pull pinned (verbatim) and recent (for summarizer). Two cheap
    // index-backed Cypher calls — no fanout per memory.
    const pinnedPage = await listMemories(driver, {
      userId: args.clerkId,
      status: "pinned",
      limit: PINNED_LIMIT,
      offset: 0,
    });
    const recentPage = await listMemories(driver, {
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
    const auth = await tryUserAndApiKeyByClerkId(
      ctx,
      args.clerkId,
      "OPENROUTER_API_KEY",
    );
    const summary = auth
      ? await callSummarizer(ctx, auth.apiKey, auth.userId, recentSnippets)
      : null;

    // Dream-maintained portrait of the MCP-active profile. Unlike About
    // (user-typed) this is inferred — labelled as such so AI clients can
    // weigh it accordingly.
    const dreamPortrait = await ctx.runQuery(
      internal.profiles.getPortraitForContextPromptInternal,
      { clerkId: args.clerkId },
    );

    const sections: string[] = [];
    sections.push("# vmem User Profile");
    sections.push("");
    sections.push("## About");
    sections.push(settings.aboutMe ?? "_(not provided)_");
    sections.push("");
    sections.push("## Preferences");
    sections.push(settings.preferences ?? "_(not provided)_");
    sections.push("");
    if (dreamPortrait) {
      sections.push("## Inferred Portrait");
      sections.push(
        "_Maintained automatically by Dream Mode from the user's memories; every claim traces back to stored memories._",
      );
      sections.push("");
      sections.push(dreamPortrait.portrait);
      sections.push("");
    }
    sections.push("## Pinned Memories");
    sections.push(formatPinnedSection(pinnedSnippets));
    sections.push("");
    sections.push("## Profile Summary");
    sections.push(summary ?? "_(summary unavailable)_");

    const skillRows = await ctx.runQuery(
      internal.skills.listByClerkIdInternal,
      { clerkId: args.clerkId },
    );
    const skillsIndex = buildSkillsIndexAddition(
      skillRows.map((skill: Doc<"skills">) => ({
        name: skill.name,
        description: skill.description,
      })),
      { mcpClient: true },
    );
    if (skillsIndex.length > 0) {
      sections.push("");
      sections.push("## Available Skills");
      sections.push(skillsIndex);
    }

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
