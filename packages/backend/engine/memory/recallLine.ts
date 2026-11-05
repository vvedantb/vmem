// The provenance suffix on every memory line recall_context and context_pack
// inject: when the memory was saved (UTC date) and which app wrote it, plus
// open maybe-conflict partners. Callers clip content by the suffix length so
// a line stays inside its usual size.

const SOURCE_DISPLAY_CHARS = 24;
const CONFLICT_IDS_SHOWN = 2;

export interface LineProvenance {
  createdAt: string;
  source: string;
  conflictsWith?: readonly string[];
}

function savedDate(createdAt: string): string | null {
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

function sourceDisplay(source: string): string | null {
  const flat = source.replace(/\s+/gu, " ").trim();
  if (flat.length === 0) return null;
  return flat.length <= SOURCE_DISPLAY_CHARS
    ? flat
    : `${flat.slice(0, SOURCE_DISPLAY_CHARS - 1)}…`;
}

/** " (saved 2026-11-04, via cursor)", or "" when nothing is known. */
export function provenanceSuffix(memory: LineProvenance): string {
  const parts: string[] = [];
  const date = savedDate(memory.createdAt);
  if (date !== null) parts.push(`saved ${date}`);
  const source = sourceDisplay(memory.source);
  if (source !== null) parts.push(`via ${source}`);
  const partners = memory.conflictsWith ?? [];
  if (partners.length > 0) {
    parts.push(
      `may conflict with ${partners.slice(0, CONFLICT_IDS_SHOWN).join(", ")}`,
    );
  }
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/** The content clip budget left after the suffix, never below a quarter. */
export function contentBudget(maxChars: number, suffix: string): number {
  return Math.max(Math.ceil(maxChars / 4), maxChars - suffix.length);
}
