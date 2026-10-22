import {
  HIGHLIGHTS_MAX,
  MEMORY_IDS_MAX,
  SUMMARY_MAX_CHARS,
} from "../../engine/memory/rollupPrompt";

export const ROLLUP_ROLE =
  "You write short daily summaries of one person's memory activity.";

// instructions + the data body from engine/memory/rollupPrompt.ts
export function buildRollupPrompt(body: string): string {
  return `Summarise this day of memory activity for the person who owns it.

# Rules
- Use only the data below. Do not invent facts, names or numbers.
- "summary": markdown, at most ${SUMMARY_MAX_CHARS} characters. Say what they worked on and what changed. Mention counts of other items only if they matter.
- "highlights": at most ${HIGHLIGHTS_MAX} one-line items, most important first.
- "memoryIds": at most ${MEMORY_IDS_MAX} ids in [brackets] from # Memories that the summary relies on. No other ids.
- Write in the second person ("You ...").

# Reply
{"summary": string, "highlights": string[], "memoryIds": string[]}

${body}`;
}
