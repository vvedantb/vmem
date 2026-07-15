import type { MemoryCandidate } from "@/types/api";

// format memories as a context prefix for ai chat inputs
export function formatMemoriesContext(memories: MemoryCandidate[]): string {
  if (memories.length === 0) return "";

  const lines = memories.map((m) => `- ${m.title}: ${m.content.slice(0, 200)}`);
  return `[Context from vmem]\n${lines.join("\n")}\n\n`;
}
