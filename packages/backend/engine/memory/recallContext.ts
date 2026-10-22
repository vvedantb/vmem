import type { MemoryCandidate } from "@vmem/sdk";
import { truncateAtWord } from "../llm/truncateAtWord";
import type { SkillIndexSlice } from "./jevSkillRecommend";
import { contentTokens } from "./tokens";
import { isLowPriorSource } from "./usefulness";

// Proactive recall: a small, token-bounded block an agent loads at the start
// of every turn. No LLM: the caller passes ranked memories, lexically matched
// skills and the cached profile. Sections fill in priority order: memories,
// skills ("Use when" lines), profile facts.

export const RECALL_DEFAULT_TOKENS = 1500;
export const RECALL_MIN_TOKENS = 200;
export const RECALL_MAX_TOKENS = 6000;
const RECALL_MEMORY_LIMIT = 8;
// fetched before page visits move down, so they can drop out of the 8
export const RECALL_RETRIEVE_LIMIT = 12;
const RECALL_SKILL_LIMIT = 3;
const RECALL_FACT_LIMIT = 6;
const MEMORY_CONTENT_CHARS = 300;
const SKILL_LINE_CHARS = 200;
const FACT_CHARS = 200;
// profile sections that are not facts about the user
const SKIPPED_PROFILE_SECTIONS = new Set(["## Available Skills"]);

export interface RecallContext {
  text: string;
  memoryIds: string[];
  skillNames: string[];
  counts: {
    memories: number;
    skills: number;
    facts: number;
    approxTokens: number;
  };
  truncated: boolean;
}

// chars / 4, rounded up
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function clampRecallTokens(maxTokens: number | undefined): number {
  const value = maxTokens ?? RECALL_DEFAULT_TOKENS;
  return Math.min(RECALL_MAX_TOKENS, Math.max(RECALL_MIN_TOKENS, value));
}

function clip(text: string, maxLen: number): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  const cut = truncateAtWord(flat, maxLen);
  return cut.length < flat.length ? `${cut}…` : cut;
}

// the "Use when ..." sentence of a skill description, else the description
export function skillUseWhen(description: string): string {
  const index = description.search(/use when/iu);
  return index < 0 ? description : description.slice(index);
}

// stemmed words that match almost any skill description ("helps plan",
// "improve your skills"): never count as evidence a skill fits
const GENERIC_SKILL_WORDS = new Set(
  (
    "help assist skill improve improv improvement make find get use used " +
    "using work task next new need want way thing good better best effectively"
  ).split(" "),
);
// a skill needs this many distinct meaningful words, or a name match
const SKILL_MIN_TERMS = 2;

function meaningfulTerms(text: string): Set<string> {
  return new Set(
    contentTokens(text, true).filter(
      (token) => token.length >= 3 && !GENERIC_SKILL_WORDS.has(token),
    ),
  );
}

// a slug name ("deploy-app") matches on any of its words; a spaced name
// ("Steve Jobs") needs all of them, so "job" alone does not match
function nameMatches(name: string, terms: Set<string>): boolean {
  const nameTerms = [...meaningfulTerms(name)];
  if (nameTerms.length === 0) return false;
  return /\s/u.test(name.trim())
    ? nameTerms.every((term) => terms.has(term))
    : nameTerms.some((term) => terms.has(term));
}

/**
 * Lexical skill match for recall_context, no LLM. Stopwords and generic
 * skill words are ignored; a skill is kept with a name match (see
 * nameMatches) or at least SKILL_MIN_TERMS distinct matched words. Ties prefer a description that
 * starts with "Use when".
 */
export function matchRecallSkills(
  message: string,
  skills: readonly SkillIndexSlice[],
): SkillIndexSlice[] {
  const terms = meaningfulTerms(message);
  if (terms.size === 0) return [];
  const scored: { skill: SkillIndexSlice; score: number }[] = [];
  for (const skill of skills) {
    const bodyTerms = meaningfulTerms(`${skill.name} ${skill.description}`);
    let hits = 0;
    for (const term of terms) if (bodyTerms.has(term)) hits += 1;
    const nameMatch = nameMatches(skill.name, terms);
    if (!nameMatch && hits < SKILL_MIN_TERMS) continue;
    const useWhen = /^\s*use when/iu.test(skill.description) ? 0.25 : 0;
    scored.push({ skill, score: hits + (nameMatch ? 0.5 : 0) + useWhen });
  }
  return scored
    .sort(
      (a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name),
    )
    .slice(0, RECALL_SKILL_LIMIT)
    .map(({ skill }) => skill);
}

type RecallMemory = Pick<
  MemoryCandidate,
  "id" | "title" | "content" | "source" | "sourceType" | "sourceUrl" | "tags"
>;

const VISIT_TAGS = new Set(["browsing-history", "history", "page-visit"]);
const VISIT_CONTENT = /\bvisited \d+ times?\b/iu;

/** A browsing-history row or page visit, not a fact the user wrote. */
export function isPageVisit(memory: RecallMemory): boolean {
  return (
    isLowPriorSource(memory.source, memory.sourceType) ||
    memory.tags.some((tag) => VISIT_TAGS.has(tag.toLowerCase())) ||
    (memory.sourceUrl !== null && VISIT_CONTENT.test(memory.content))
  );
}

/**
 * Keeps the retrieve order but moves page visits below every substantive
 * memory, so a visit only fills slots (and budget) the rest leave free.
 */
export function rankRecallMemories<T extends RecallMemory>(
  memories: readonly T[],
  limit: number = RECALL_MEMORY_LIMIT,
): T[] {
  const visits = memories.filter(isPageVisit);
  const substantive = memories.filter((memory) => !isPageVisit(memory));
  return [...substantive, ...visits].slice(0, limit);
}

/** Bullet-sized facts from the context prompt, skills index left out. */
export function profileFacts(profile: string | null): string[] {
  if (profile === null) return [];
  const facts: string[] = [];
  let skipped = false;
  for (const raw of profile.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("#")) {
      skipped = SKIPPED_PROFILE_SECTIONS.has(line);
      continue;
    }
    // empty lines and italic placeholders ("_(not provided)_")
    if (skipped || line.length === 0 || line.startsWith("_")) continue;
    facts.push(clip(line.replace(/^[-*]\s+/u, ""), FACT_CHARS));
    if (facts.length === RECALL_FACT_LIMIT) break;
  }
  return facts;
}

export function buildRecallContext(args: {
  message: string;
  memories: readonly Pick<MemoryCandidate, "id" | "title" | "content">[];
  skills: readonly SkillIndexSlice[];
  facts: readonly string[];
  maxTokens: number;
}): RecallContext {
  const maxChars = args.maxTokens * 4;
  const header = `# vmem recall\nFor: ${clip(args.message, 160)}`;
  const lines: string[] = [header];
  // `used` is the exact length of lines.join("\n")
  let used = header.length;
  let truncated = false;
  const tryAdd = (line: string): boolean => {
    if (used + 1 + line.length > maxChars) {
      truncated = true;
      return false;
    }
    lines.push(line);
    used += 1 + line.length;
    return true;
  };
  // a section heading ships only with its first line
  const addSection = <T>(
    heading: string,
    items: readonly T[],
    toLine: (item: T) => string,
  ): T[] => {
    const added: T[] = [];
    for (const item of items) {
      const line = toLine(item);
      if (added.length === 0) {
        if (used + 2 + heading.length + 1 + line.length > maxChars) {
          truncated = true;
          break;
        }
        tryAdd("");
        tryAdd(heading);
      }
      if (!tryAdd(line)) break;
      added.push(item);
    }
    return added;
  };

  const memories = addSection(
    "## Memories",
    args.memories,
    (memory) =>
      `- ${memory.title} (id: ${memory.id}): ${clip(memory.content, MEMORY_CONTENT_CHARS)}`,
  );
  const skills = addSection(
    "## Skills (call skills_get before following one)",
    args.skills,
    (skill) =>
      `- ${skill.name}: ${clip(skillUseWhen(skill.description), SKILL_LINE_CHARS)}`,
  );
  const facts = addSection("## Profile", args.facts, (fact) => `- ${fact}`);
  if (memories.length === 0 && skills.length === 0 && facts.length === 0) {
    tryAdd("_Nothing relevant in vmem for this message._");
  }

  const text = lines.join("\n");
  return {
    text,
    memoryIds: memories.map((memory) => memory.id),
    skillNames: skills.map((skill) => skill.name),
    counts: {
      memories: memories.length,
      skills: skills.length,
      facts: facts.length,
      approxTokens: approxTokens(text),
    },
    truncated,
  };
}
