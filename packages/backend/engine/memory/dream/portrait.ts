import { z } from "zod";
import { parseJsonString } from "../../llm/extractJsonString";
import { truncateAtWord } from "../../llm/truncateAtWord";
import { wrapUntrustedData, withUntrustedRule } from "./untrusted";

// nightly dreaming portrait step: one call per personal profile keeps a short
// description of the user, drawn only from stored memories. The MCP context
// prompt and the dashboard card show it. Pure: the caller makes the call
// (feature "dream", thinking off) and stores the result on the profile.

const DAY_MS = 24 * 60 * 60 * 1000;
const PORTRAIT_MAX_CHARS = 1_200;
const CONTENT_CHARS = 400;
// memories sent in one call
export const DREAM_PORTRAIT_MAX_MEMORIES = 30;
// a portrait this old is written again, so claims of deleted memories leave
const PORTRAIT_MAX_AGE_MS = 7 * DAY_MS;

export const DREAM_PORTRAIT_ROLE = withUntrustedRule(
  "You maintain a short factual portrait of one user for a memory system. AI assistants read it to understand the user.",
);

export interface DreamPortraitMemory {
  id: string;
  title: string;
  content: string;
  type: string;
  pinned: boolean;
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * True when the portrait must be written again: there is none, it is older
 * than 7 days, or a memory of the evidence changed after it was written.
 */
export function isPortraitDue(
  writtenAt: number | null,
  evidence: readonly DreamPortraitMemory[],
  now: number,
): boolean {
  if (evidence.length === 0) return false;
  if (writtenAt === null || now - writtenAt >= PORTRAIT_MAX_AGE_MS) return true;
  return evidence.some((memory) => memory.updatedAt > writtenAt);
}

// pinned first, then confident, then recent (half weight after 30 days)
function evidenceScore(memory: DreamPortraitMemory, now: number): number {
  const ageDays = Math.max(0, now - memory.createdAt) / DAY_MS;
  return (memory.pinned ? 2 : 0) + memory.confidence + 1 / (1 + ageDays / 30);
}

/** The memories one call sees: the best by evidenceScore. */
export function pickPortraitEvidence<M extends DreamPortraitMemory>(
  memories: readonly M[],
  now: number,
): M[] {
  return [...memories]
    .sort((a, b) => evidenceScore(b, now) - evidenceScore(a, now))
    .slice(0, DREAM_PORTRAIT_MAX_MEMORIES);
}

// the prompt names the memories m0, m1, ..., never by their row ids
function keyOf(index: number): string {
  return `m${String(index)}`;
}

export function buildDreamPortraitPrompt(
  current: string | null,
  evidence: readonly DreamPortraitMemory[],
): string {
  const rows = evidence.map((memory, i) => ({
    id: keyOf(i),
    type: memory.type,
    date: new Date(memory.createdAt).toISOString().slice(0, 10),
    pinned: memory.pinned,
    title: memory.title,
    content: truncateAtWord(memory.content, CONTENT_CHARS),
  }));
  return [
    "Revise the current portrait of the user from the memories below.",
    "Rules:",
    "- Keep statements that the memories still support.",
    "- Revise statements that newer memories replace. A newer memory wins.",
    "- Drop statements that no memory supports.",
    "- Add what the memories show: role, projects, tools, preferences, recurring people, current focus.",
    "- Pinned memories matter most to the user. Give them the most weight.",
    '- Write in third person ("The user ..."). Plain markdown: short paragraphs or a few bullet lists, no headings.',
    '- State facts only. Never mention "memories", "evidence" or this update.',
    "- Do not guess. With few memories, a short portrait is correct.",
    "- sourceIds: the ids of the memories the portrait uses.",
    `Reply as JSON: {"portrait": "markdown, at most ${String(PORTRAIT_MAX_CHARS)} characters", "sourceIds": ["m0"]}`,
    "",
    wrapUntrustedData(
      JSON.stringify(
        { currentPortrait: current?.trim() ?? "", memories: rows },
        null,
        2,
      ),
    ),
  ].join("\n");
}

const replySchema = z.object({
  portrait: z.string(),
  sourceIds: z.array(z.string()).catch([]),
});

/**
 * Reads the reply. Null for a malformed reply, an empty portrait, or a
 * portrait that names no memory of the evidence: every portrait must trace
 * back to stored memories.
 */
export function parseDreamPortraitReply<M extends DreamPortraitMemory>(
  evidence: readonly M[],
  content: string | null,
): { portrait: string; sources: M[] } | null {
  if (content === null) return null;
  const reply = parseJsonString(content, replySchema);
  if (reply === null) return null;
  const portrait = truncateAtWord(reply.portrait.trim(), PORTRAIT_MAX_CHARS);
  const sources = evidence.filter((_, i) => reply.sourceIds.includes(keyOf(i)));
  if (portrait.length === 0 || sources.length === 0) return null;
  return { portrait, sources };
}
