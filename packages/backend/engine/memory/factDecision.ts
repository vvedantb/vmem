import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";
import {
  decideFactDeterministic,
  findExactHashMatch,
  type DecisionCandidate,
  type FactDecision,
  type FactDecisionEvent,
} from "./supersede";

const factDecisionEventSchema = z.enum(["ADD", "UPDATE", "DELETE", "NONE"]);

const factDecisionResponseSchema = z.object({
  event: z.string(),
  id: z.string().optional().catch(undefined),
  text: z.string().optional().catch(undefined),
  oldMemory: z.string().optional().catch(undefined),
});

export function buildFactDecisionPrompt(
  factText: string,
  candidates: readonly DecisionCandidate[],
): string {
  const listed =
    candidates.length === 0
      ? "(no existing memories — must be ADD or NONE)"
      : candidates
          .map(
            (candidate, index) =>
              `${String(index + 1)}. id=${candidate.id}\n   title: ${candidate.title}\n   content: ${candidate.content}`,
          )
          .join("\n");

  return `You reconcile one new atomic fact against existing memories. Respond with ONLY a JSON object.

# New fact
${factText}

# Existing memories
${listed}

# Events
- ADD: new information not represented in any existing memory.
- UPDATE: the fact contradicts or supersedes exactly ONE existing memory. Include that memory's id and the replacement text.
- DELETE: the user is explicitly removing a fact. Include that memory's id.
- NONE: the fact is already represented (paraphrase). Do nothing.

Prefer NONE over UPDATE when wording differs but meaning is identical.
Prefer UPDATE over DELETE when the new fact replaces the old one ("I prefer Rust now" replaces "I prefer Python").
Use DELETE only when the user is removing a fact ("I no longer work at Acme").
Never UPDATE/DELETE based on guessed contradictions — the contradiction must be plain in the text.

# Output
ADD: { "event": "ADD", "text": "I prefer TypeScript" }
UPDATE: { "event": "UPDATE", "id": "<existing id>", "text": "I prefer TypeScript", "oldMemory": "I prefer Python" }
DELETE: { "event": "DELETE", "id": "<existing id>" }
NONE: { "event": "NONE" }`;
}

export function parseFactDecisionResponse(
  raw: string,
  factText: string,
  candidates: readonly DecisionCandidate[],
): FactDecision | null {
  const parsed = parseJsonString(raw, factDecisionResponseSchema);
  if (!parsed) return null;
  const eventResult = factDecisionEventSchema.safeParse(
    parsed.event.trim().toUpperCase(),
  );
  if (!eventResult.success) return null;
  const event: FactDecisionEvent = eventResult.data;
  const text = parsed.text?.trim() || factText.trim();
  const id = parsed.id?.trim();
  const known = new Set(candidates.map((candidate) => candidate.id));

  if (event === "ADD") {
    return { event: "ADD", text };
  }
  if (event === "NONE") {
    return { event: "NONE", targetId: id, text };
  }
  if (event === "UPDATE") {
    if (
      id === undefined ||
      id.length === 0 ||
      !known.has(id) ||
      text.length === 0
    ) {
      return null;
    }
    const target = candidates.find((candidate) => candidate.id === id);
    return {
      event: "UPDATE",
      targetId: id,
      text,
      oldMemory: parsed.oldMemory ?? target?.content,
    };
  }
  if (id === undefined || id.length === 0 || !known.has(id)) return null;
  return { event: "DELETE", targetId: id, text };
}

export function resolveFactDecision(args: {
  factText: string;
  candidates: readonly DecisionCandidate[];
  llmDecision?: FactDecision | null;
}): FactDecision {
  const exact = findExactHashMatch(args.factText, args.candidates);
  if (exact) {
    return { event: "NONE", targetId: exact.id, text: args.factText.trim() };
  }
  const llm = args.llmDecision;
  if (llm !== null && llm !== undefined) {
    if (llm.event === "ADD" && llm.text.trim().length === 0) {
      return { event: "ADD", text: args.factText.trim() };
    }
    if (llm.event === "ADD") {
      return { ...llm, text: llm.text.trim() || args.factText.trim() };
    }
    return llm;
  }
  return decideFactDeterministic(args.factText, args.candidates);
}
