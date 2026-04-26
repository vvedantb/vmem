/**
 * V2 fact-extraction & decision prompts (mem0-derived).
 *
 * Two-stage pipeline used by the chrome-extension prompt-capture flow:
 *
 *   Stage A (extract): given a single user prompt that was just submitted
 *   to ChatGPT/Claude/T3, decompose it into atomic facts about the user.
 *   "I'm building vmem with Convex and Neo4j, and my favorite editor is
 *   Helix" → three facts.
 *
 *   Stage B (decide): for each fact, given the top-N hybrid-retrieved
 *   existing memories, emit ADD / UPDATE / DELETE / NONE — UPDATEs and
 *   DELETEs become :ProposedUpdate nodes (never silent overwrites).
 *
 * Prompts are derived from mem0's `ADDITIVE_EXTRACTION_PROMPT` and
 * `DEFAULT_UPDATE_MEMORY_PROMPT` but trimmed for our scope (single
 * prompt; no conversation history; English only). The output schema is
 * narrower than mem0's — we never propagate `attributedTo` because the
 * prompt-capture path always implicitly attributes to the user.
 *
 * Parsers tolerate `<think>...</think>` tags (Qwen3 and other thinking
 * models). Errors return null; callers degrade gracefully (skip this
 * fact / skip this memory).
 */

export interface ExtractedFact {
  /** Stable id within this extraction (0-indexed). Useful for telemetry. */
  id: number;
  /** Canonical fact text. First-person, present tense, single statement. */
  text: string;
}

export interface ExtractedFactsResponse {
  facts: ExtractedFact[];
}

export type UpdateDecisionEvent = "ADD" | "UPDATE" | "DELETE" | "NONE";

export interface UpdateDecision {
  event: UpdateDecisionEvent;
  /** Existing memory id targeted by UPDATE / DELETE. Absent for ADD / NONE. */
  id?: string;
  /** Proposed text for ADD / UPDATE. Absent for DELETE / NONE. */
  text?: string;
  /** Existing memory text for UPDATE (lets us include diff in proposal reason). */
  oldMemory?: string;
}

export interface RetrievedCandidate {
  id: string;
  text: string;
}

// ──────────────────────────────────────────────────────────────────────
// Stage A — extract atomic facts
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Stage B — decide ADD / UPDATE / DELETE / NONE per fact
// ──────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────
// Parsers
// ──────────────────────────────────────────────────────────────────────

/**
 * Strip <think> blocks and markdown code fences from a raw LLM response,
 * leaving just the JSON. Mirrors `enrichmentPrompt.extractJsonString` —
 * kept as a dedicated copy so this file has no dependency on the
 * enrichment prompt module (different concern, different lifecycle).
 */
function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();

  // Closed think blocks
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Unclosed think block (model hit token limit mid-thought)
  if (jsonStr.startsWith("<think>")) {
    const closeIdx = jsonStr.indexOf("</think>");
    if (closeIdx === -1) {
      jsonStr = jsonStr.slice(7).trim();
    }
  }

  // Markdown fence
  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match && match[1]) {
      jsonStr = match[1].trim();
    }
  }

  return jsonStr;
}

function isStringValue(v: unknown): v is string {
  return typeof v === "string";
}

function isNumberValue(v: unknown): v is number {
  return typeof v === "number";
}

export function parseFactExtractionResponse(
  raw: string,
): ExtractedFactsResponse | null {
  try {
    const jsonStr = extractJsonString(raw);
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;

    const factsRaw = Reflect.get(parsed, "facts");
    if (!Array.isArray(factsRaw)) return null;

    const facts: ExtractedFact[] = [];
    for (const item of factsRaw) {
      if (typeof item !== "object" || item === null) continue;
      const idRaw = Reflect.get(item, "id");
      const textRaw = Reflect.get(item, "text");
      if (!isStringValue(textRaw)) continue;
      const text = textRaw.trim();
      if (text.length === 0) continue;
      const id = isNumberValue(idRaw) ? idRaw : facts.length;
      facts.push({ id, text });
    }
    return { facts };
  } catch {
    console.error("[v2] Failed to parse fact-extraction response:", raw);
    return null;
  }
}

const VALID_EVENTS: ReadonlySet<string> = new Set([
  "ADD",
  "UPDATE",
  "DELETE",
  "NONE",
]);

function toEvent(v: unknown): UpdateDecisionEvent | null {
  if (!isStringValue(v)) return null;
  const upper = v.trim().toUpperCase();
  if (!VALID_EVENTS.has(upper)) return null;
  // The set membership above narrows to one of the four literals.
  if (upper === "ADD") return "ADD";
  if (upper === "UPDATE") return "UPDATE";
  if (upper === "DELETE") return "DELETE";
  return "NONE";
}

export function parseUpdateDecisionResponse(
  raw: string,
): UpdateDecision | null {
  try {
    const jsonStr = extractJsonString(raw);
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;

    const event = toEvent(Reflect.get(parsed, "event"));
    if (!event) return null;

    const idRaw = Reflect.get(parsed, "id");
    const textRaw = Reflect.get(parsed, "text");
    const oldMemoryRaw = Reflect.get(parsed, "old_memory");

    const id =
      isStringValue(idRaw) && idRaw.trim().length > 0 ? idRaw : undefined;
    const text =
      isStringValue(textRaw) && textRaw.trim().length > 0 ? textRaw : undefined;
    const oldMemory =
      isStringValue(oldMemoryRaw) && oldMemoryRaw.trim().length > 0
        ? oldMemoryRaw
        : undefined;

    // Per-event validation. Reject malformed responses so the caller can
    // skip cleanly instead of writing a corrupt proposal.
    if (event === "ADD" && !text) return null;
    if (event === "UPDATE" && (!id || !text)) return null;
    if (event === "DELETE" && !id) return null;

    return { event, id, text, oldMemory };
  } catch {
    console.error("[v2] Failed to parse update-decision response:", raw);
    return null;
  }
}
