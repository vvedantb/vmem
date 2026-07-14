// V2 fact-extraction & decision prompts (mem0-derived)

import { z } from "zod";
import { parseJsonString } from "../../engine/llm/extractJsonString";

export interface ExtractedFact {
  // stable id within this extraction (0-indexed)
  id: number;
  // canonical fact text
  text: string;
}

export interface ExtractedFactsResponse {
  facts: ExtractedFact[];
}

export type UpdateDecisionEvent = "ADD" | "UPDATE" | "DELETE" | "NONE";

export interface UpdateDecision {
  event: UpdateDecisionEvent;
  // existing memory id targeted by UPDATE / DELETE
  id?: string;
  // proposed text for ADD / UPDATE
  text?: string;
  // existing memory text for UPDATE (lets us include diff in proposal reason)
  oldMemory?: string;
}

export interface RetrievedCandidate {
  id: string;
  text: string;
}

// stage A — extract atomic facts

export function buildFactExtractionPrompt(
  capturedPrompt: string,
  observationDate: string,
  currentDate: string,
): string {
  return `You are a personal-memory fact extractor. Given a single message the user sent to an AI assistant, extract every atomic, durable fact ABOUT THE USER that is worth remembering. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

Decompose the user's message into atomic facts. Each fact:
- Is a SINGLE statement (no compound sentences, no conjunctions).
- Is about the USER (their preferences, projects, beliefs, life facts, decisions).
- Is durable — would still be true a week from now (skip ephemeral mood, momentary requests, "today" without context).
- Is first-person, present tense.

If the message contains no durable facts about the user (e.g. "what's the weather?" or "explain monads"), return { "facts": [] }.

# Core Rules

## Preserve Specific Details

Never generalize. If the user says "I'm using TypeScript 5.4 with Bun", facts must include:
- "I am using TypeScript 5.4"
- "I am using Bun"

NOT a single fact "I am using JavaScript tooling" — that loses the specificity that makes the memory useful later.

## No Fabrication

Every fact must be grounded in the user's literal words. Do not infer:
- Don't infer affiliation: "I work with React" does NOT imply "I work at Meta".
- Don't infer expertise: "I'm using Rust" does NOT imply "I am a Rust expert".
- Don't infer demographics: do not guess gender, age, nationality, or location from a name.

## No Implicit Inference

If the user says "Ada wrote our auth module", that's "Ada wrote the auth module" — do NOT add a fact about Ada's gender or seniority.

## Atomic Decomposition

Compound statements MUST be split:
- "I love Python and I prefer Vim" → 2 facts: "I love Python" / "I prefer Vim"
- "I'm building vmem with Convex and Neo4j" → 3 facts:
  - "I am building vmem"
  - "I use Convex for vmem"
  - "I use Neo4j for vmem"

## Skip the Question

If the message is mostly a question to the AI ("how do I X?"), the question itself is NOT a fact about the user. But if the question implies a durable user state ("how do I deploy MY Next.js 15 app to MY Vercel project?"), the implied facts ARE durable: "I have a Next.js 15 app" / "I deploy to Vercel".

# Context

Observation date (when the user sent this): ${observationDate}
Current date (when you are extracting): ${currentDate}

# Output schema

{
  "facts": [
    { "id": 0, "text": "I prefer TypeScript over JavaScript" },
    { "id": 1, "text": "I am building a memory app called vmem" }
  ]
}

If no durable facts: { "facts": [] }

# User message

${capturedPrompt}

# Your output (JSON only)`;
}

// stage B — decide ADD / UPDATE / DELETE / NONE per fact

export function buildUpdateDecisionPrompt(
  fact: string,
  candidates: RetrievedCandidate[],
): string {
  const candidatesBlock =
    candidates.length === 0
      ? "(no existing memories — must be ADD)"
      : candidates
          .map((c, idx) => `${idx + 1}. ID: ${c.id}\n   TEXT: ${c.text}`)
          .join("\n\n");

  return `You are deciding how a newly extracted fact about the user relates to the user's existing memories. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

For the new fact below, choose ONE of:

- **ADD**: the fact is new information not represented in any existing memory.
- **UPDATE**: the fact contradicts or supersedes exactly ONE existing memory (e.g. user changed their mind, switched stack, moved). Specify which memory ID.
- **DELETE**: the fact directly contradicts ONE existing memory and the old memory should be REMOVED, not just rewritten (e.g. user explicitly said "I don't X anymore"). Specify which memory ID.
- **NONE**: the fact is already represented by an existing memory (paraphrase). Do nothing.

# Decision rules

- Prefer NONE over UPDATE when the wording differs but the meaning is identical.
- Prefer UPDATE over DELETE when the new fact REPLACES the old one (e.g. "I prefer Rust now" replaces "I prefer Python").
- Use DELETE only when the user is explicitly removing a fact (e.g. "I no longer work at Acme" → delete "I work at Acme").
- ADD when there is overlap but the new fact adds genuinely new specificity (different version, different tool, different project).
- Never UPDATE/DELETE based on guessed contradictions — the contradiction must be plain in the text.

# Output schema

For ADD:
{ "event": "ADD", "text": "I prefer Rust over Python" }

For UPDATE (id is the existing memory id from the candidate list):
{
  "event": "UPDATE",
  "id": "<existing memory id>",
  "text": "<the new full memory text after update>",
  "old_memory": "<the existing memory text>"
}

For DELETE:
{
  "event": "DELETE",
  "id": "<existing memory id>"
}

For NONE:
{ "event": "NONE" }

# Existing memories

${candidatesBlock}

# New fact

"${fact}"

# Your output (JSON only)`;
}

// parsers

const factItemSchema = z.object({
  id: z.number().optional().catch(undefined),
  text: z.string().trim().min(1),
});

const factExtractionResponseSchema = z.object({
  facts: z.array(z.unknown()),
});

export function parseFactExtractionResponse(
  raw: string,
): ExtractedFactsResponse | null {
  const parsed = parseJsonString(raw, factExtractionResponseSchema);
  if (!parsed) {
    console.error("[v2] Failed to parse fact-extraction response:", raw);
    return null;
  }

  const facts: ExtractedFact[] = [];
  for (const item of parsed.facts) {
    const fact = factItemSchema.safeParse(item);
    if (!fact.success) continue;
    facts.push({ id: fact.data.id ?? facts.length, text: fact.data.text });
  }
  return { facts };
}

const updateDecisionResponseSchema = z.object({
  event: z.string(),
  id: z.string().optional().catch(undefined),
  text: z.string().optional().catch(undefined),
  old_memory: z.string().optional().catch(undefined),
});

const updateDecisionEventSchema = z.enum(["ADD", "UPDATE", "DELETE", "NONE"]);

function optionalNonEmptyString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseUpdateDecisionResponse(
  raw: string,
): UpdateDecision | null {
  const parsed = parseJsonString(raw, updateDecisionResponseSchema);
  if (!parsed) {
    console.error("[v2] Failed to parse update-decision response:", raw);
    return null;
  }

  const eventResult = updateDecisionEventSchema.safeParse(
    parsed.event.trim().toUpperCase(),
  );
  if (!eventResult.success) return null;
  const event = eventResult.data;

  const id = optionalNonEmptyString(parsed.id);
  const text = optionalNonEmptyString(parsed.text);
  const oldMemory = optionalNonEmptyString(parsed.old_memory);

  // per-event validation. Reject malformed responses so the caller can
  // skip cleanly instead of writing a corrupt proposal
  if (event === "ADD" && !text) return null;
  if (event === "UPDATE" && (!id || !text)) return null;
  if (event === "DELETE" && !id) return null;

  return { event, id, text, oldMemory };
}
