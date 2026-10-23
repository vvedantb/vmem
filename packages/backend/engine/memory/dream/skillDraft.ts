import { z } from "zod";
import { parseJsonString } from "../../llm/extractJsonString";
import { truncateAtWord } from "../../llm/truncateAtWord";
import { isNearDuplicateSkill, type DedupeSkill } from "../skills/dedupe";
import {
  MIN_SKILL_STEPS,
  skillSteps,
  triggerDescription,
} from "../skills/draft";
import { isUnsafeSkill } from "../skills/safety";
import { slugify } from "../skills/words";
import type { MemoryOutcome } from "./outcome";

// nightly dreaming skill step: one call per profile run drafts reusable
// skills from the run window's memories that record what worked, with
// pitfalls from what failed. Pure: the caller makes the call (feature
// "dream", thinking off) and stores each draft as a proposal, never as a
// published skill.

const CONTENT_CHARS = 700;
// memories sent in one call: what worked first, then what failed
export const DREAM_SKILL_MAX_MEMORIES = 12;
export const DREAM_SKILL_MAX_DRAFTS = 2;
const MAX_PITFALLS = 5;
// existing skill names listed in the prompt (dedupe checks all of them)
const PROMPT_SKILL_NAMES = 40;

export const DREAM_SKILL_ROLE =
  "You turn saved memories of one user into reusable skills: short procedures a future AI agent follows.";

export interface DreamSkillMemory {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  outcome: MemoryOutcome;
}

export interface DreamSkillDraft {
  name: string;
  description: string;
  steps: string[];
  pitfalls: string[];
  // ids of the memories the draft came from; at least one worked
  sourceIds: string[];
}

export interface DreamSkillDrops {
  invalid: number;
  unsafe: number;
  duplicate: number;
}

function backsSkill(outcome: MemoryOutcome): boolean {
  return outcome !== "failed";
}

/**
 * The memories one call sees: newest first, the ones that worked (or
 * worked in part) before the ones that failed. Empty when none worked: with
 * no procedure that worked there is nothing to draft, and no call is made.
 */
export function pickSkillSources<M extends DreamSkillMemory>(
  memories: readonly M[],
): M[] {
  if (!memories.some((memory) => backsSkill(memory.outcome))) return [];
  return [...memories]
    .sort(
      (a, b) =>
        Number(backsSkill(b.outcome)) - Number(backsSkill(a.outcome)) ||
        b.createdAt - a.createdAt,
    )
    .slice(0, DREAM_SKILL_MAX_MEMORIES);
}

// the prompt names the memories m0, m1, ..., never by their row ids
function keyOf(index: number): string {
  return `m${String(index)}`;
}

export function buildDreamSkillPrompt(
  memories: readonly DreamSkillMemory[],
  existingNames: readonly string[],
): string {
  const rows = memories.map((memory, i) => ({
    id: keyOf(i),
    outcome: memory.outcome,
    title: memory.title,
    content: truncateAtWord(memory.content, CONTENT_CHARS),
  }));
  const names = existingNames.slice(0, PROMPT_SKILL_NAMES);
  return [
    `Draft at most ${String(DREAM_SKILL_MAX_DRAFTS)} skills from these memories. Most often the right answer is none.`,
    'outcome: "worked" (the approach worked), "failed" (it failed) or "mixed" (one part failed, a later part worked).',
    "Rules:",
    '- Draft a skill only for a reusable multi-step procedure that "worked" or "mixed" memories show working. Never from "failed" memories alone.',
    '- Prefer the steps that worked. Turn what failed into pitfalls: one imperative warning each, such as "Do not X; do Y instead".',
    "- name: kebab-case, names the procedure.",
    '- description: a direct trigger, either "Use when a task names <concrete task, product, file or tool>..." or "Use when a task asks to <concrete action>...". Never "Use when working on this" or "similar tasks".',
    `- steps: ${String(MIN_SKILL_STEPS)} to 10 imperative steps. Each starts with a verb and holds for any future task: no ids, hashes, temp paths, dates or one-off numbers.`,
    "- Never recommend bypassing a safeguard: hooks, tests, lint, type checks, CI, TLS, secrets, force-push or broad deletes.",
    "- Do not draft a skill that repeats an existing skill.",
    "- sourceIds: the ids of the memories the skill comes from.",
    'Reply as JSON: {"skills": [{"name": "...", "description": "Use when a task ...", "steps": ["..."], "pitfalls": ["..."], "sourceIds": ["m0"]}]}',
    `Existing skills: ${names.length > 0 ? names.join(", ") : "(none)"}`,
    "",
    JSON.stringify({ memories: rows }, null, 2),
  ].join("\n");
}

// lenient: a malformed skill is dropped, not the whole reply
const rawSkillSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().catch(""),
  steps: z.array(z.string()).catch([]),
  pitfalls: z.array(z.string()).catch([]),
  sourceIds: z.array(z.string()).catch([]),
});
const replySchema = z.object({
  skills: z.array(rawSkillSchema.nullable().catch(null)).catch([]),
});

/**
 * Reads the reply into drafts that may be proposed. A draft is dropped when
 * it has no direct trigger, fewer than 3 general steps or no source that
 * worked (invalid); when its name, description, any step or pitfall
 * recommends bypassing a safeguard (unsafe); or when it nearly repeats an
 * existing skill, a skill already proposed, or an earlier draft (duplicate).
 * Null for a malformed reply.
 */
export function parseDreamSkillReply(
  memories: readonly DreamSkillMemory[],
  content: string | null,
  existing: readonly DedupeSkill[],
): { drafts: DreamSkillDraft[]; dropped: DreamSkillDrops } | null {
  if (content === null) return null;
  const reply = parseJsonString(content, replySchema);
  if (reply === null) return null;
  const dropped: DreamSkillDrops = { invalid: 0, unsafe: 0, duplicate: 0 };
  const drafts: DreamSkillDraft[] = [];
  for (const raw of reply.skills) {
    if (drafts.length >= DREAM_SKILL_MAX_DRAFTS) break;
    if (raw === null) {
      dropped.invalid += 1;
      continue;
    }
    const sources = memories.filter((_, i) => raw.sourceIds.includes(keyOf(i)));
    const description = triggerDescription(raw.description);
    const steps = skillSteps(raw.steps);
    if (
      description === null ||
      steps.length < MIN_SKILL_STEPS ||
      !sources.some((memory) => backsSkill(memory.outcome))
    ) {
      dropped.invalid += 1;
      continue;
    }
    const draft: DreamSkillDraft = {
      name: slugify(raw.name, 48),
      description,
      steps,
      pitfalls: skillSteps(raw.pitfalls).slice(0, MAX_PITFALLS),
      sourceIds: sources.map((memory) => memory.id),
    };
    if (
      isUnsafeSkill({
        name: draft.name,
        description: draft.description,
        steps: [...draft.steps, ...draft.pitfalls],
      })
    ) {
      dropped.unsafe += 1;
      continue;
    }
    if (
      [...existing, ...drafts].some((skill) =>
        isNearDuplicateSkill(skill, draft),
      )
    ) {
      dropped.duplicate += 1;
      continue;
    }
    drafts.push(draft);
  }
  return { drafts, dropped };
}

/** The skill body: numbered steps, then the pitfalls, labelled. */
export function skillInstructions(draft: {
  steps: readonly string[];
  pitfalls: readonly string[];
}): string {
  const steps = draft.steps.map((step, i) => `${String(i + 1)}. ${step}`);
  if (draft.pitfalls.length === 0) return steps.join("\n");
  return [
    ...steps,
    "",
    "Pitfalls (from approaches that failed):",
    ...draft.pitfalls.map((pitfall) => `- ${pitfall}`),
  ].join("\n");
}

/** An existing skill (or skill proposal) as the dedupe compares it. */
export function existingSkillForDedupe(skill: {
  name: string;
  description: string;
  instructions: string;
}): DedupeSkill {
  return {
    name: skill.name,
    description: skill.description,
    steps: skill.instructions.split("\n"),
  };
}
