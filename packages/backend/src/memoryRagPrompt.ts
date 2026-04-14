export interface MemoryRagCandidate {
  id: string;
  title: string;
  content: string;
  trace?: {
    reason: string;
  };
}

const CONTENT_PREVIEW_MAX = 900;

function truncateContent(text: string): string {
  const t = text.trim();
  if (t.length <= CONTENT_PREVIEW_MAX) return t;
  return `${t.slice(0, CONTENT_PREVIEW_MAX)}…`;
}

export function buildMemoryRagAddition(
  candidates: MemoryRagCandidate[],
): string {
  if (candidates.length === 0) return "";

  const lines: string[] = [
    "Relevant memories retrieved for this turn (ground your answer in these when they apply; if none fit, say so):",
    "",
  ];

  for (const m of candidates) {
    const preview = truncateContent(m.content);
    const traceLine = m.trace?.reason
      ? ` Match context: ${m.trace.reason}`
      : "";
    lines.push(`[${m.id}] ${m.title}`);
    lines.push(preview);
    if (traceLine) lines.push(traceLine.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export const VMEM_LOCAL_CHAT_CORE = [
  "You are vmem, a memory assistant that helps users store, search, and recall their personal memories.",
  "You are currently running locally on the user's device with limited capabilities.",
  "When the Relevant memories section is present below, use it to answer accurately; if it is missing, incomplete, or not applicable, say so clearly and help with general guidance where appropriate.",
  "Be concise and helpful.",
].join(" ");

export const VMEM_VOICE_SPOKEN_SUFFIX =
  " Keep responses short since they will be spoken aloud.";

export const VMEM_VOICE_CORE = VMEM_LOCAL_CHAT_CORE + VMEM_VOICE_SPOKEN_SUFFIX;

export function composeSystemPrompt(
  core: string,
  memoryAddition: string,
): string {
  if (!memoryAddition) return core;
  return `${core}\n\n${memoryAddition}`;
}
