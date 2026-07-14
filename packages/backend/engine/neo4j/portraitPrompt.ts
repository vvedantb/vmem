import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";
import { filterValidIds } from "./dreamPrompt";

const PORTRAIT_CHAR_CAP = 2000;
const EVIDENCE_CONTENT_CHAR_CAP = 400;

export interface PortraitEvidenceMemory {
  id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface ParsedPortrait {
  portrait: string;
  sourceMemoryIds: string[];
}

export function buildPortraitUpdatePrompt(
  currentPortrait: string | null,
  evidence: PortraitEvidenceMemory[],
): string {
  const evidenceBlock = evidence
    .map((m, i) => {
      const content =
        m.content.length > EVIDENCE_CONTENT_CHAR_CAP
          ? `${m.content.slice(0, EVIDENCE_CONTENT_CHAR_CAP)}…`
          : m.content;
      const pinned = m.status === "pinned" ? "  [pinned]" : "";
      return [
        `[${String(i + 1)}] id=${m.id}  (${m.type}, ${m.createdAt.slice(0, 10)})${pinned}`,
        `Title: ${m.title}`,
        `Content: ${content}`,
      ].join("\n");
    })
    .join("\n\n");

  const currentBlock = currentPortrait?.trim()
    ? currentPortrait
    : "_(none yet — write the first portrait)_";

  return `You maintain a "portrait" of a user for a memory system: a short, factual description of who they are, what they work on, and what they prefer, derived ONLY from their stored memories. AI assistants read this portrait to understand the user. Respond with ONLY a JSON object — no explanation, no thinking, no markdown fences.

# Task

Revise the current portrait in light of the evidence memories below.

- KEEP statements from the current portrait that the evidence still supports.
- REVISE statements the evidence has overtaken (newer memories win over older ones).
- DROP statements with no support in the evidence — the portrait must never carry claims you cannot point to a memory for.
- ADD what the evidence newly establishes: role, projects, tools, preferences, recurring people, current focus.
- Pinned memories are the user's own "this matters" signal — weight them highest.

# Output

{"portrait": "markdown, <= 1200 characters", "sourceMemoryIds": ["id1", "id2"]}

# Rules

- Write in third person ("The user ..."). Plain markdown: short paragraphs or a few bullet lists, no headings.
- State facts, not meta-commentary: never mention "memories", "evidence", or this update process.
- No speculation. If the evidence is thin, a short portrait is correct.
- \`sourceMemoryIds\`: the ids of every evidence memory the portrait actually draws on. Each id must literally appear in the evidence list.

# Current portrait

${currentBlock}

# Evidence memories

${evidenceBlock}

# Output

Respond with ONLY the JSON object specified above.`;
}

const portraitResponseSchema = z.object({
  portrait: z.string(),
  sourceMemoryIds: z.array(z.string()).optional(),
});

export function parsePortraitResponse(
  raw: string,
  evidenceIds: string[],
): ParsedPortrait | null {
  const data = parseJsonString(raw, portraitResponseSchema);
  if (!data) return null;

  const portrait = data.portrait.trim().slice(0, PORTRAIT_CHAR_CAP);
  if (portrait.length === 0) return null;

  const sourceMemoryIds = filterValidIds(
    data.sourceMemoryIds,
    new Set(evidenceIds),
  );
  if (sourceMemoryIds.length === 0) return null;

  return { portrait, sourceMemoryIds };
}
