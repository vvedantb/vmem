import { extractJsonString } from "./llm/extractJsonString";

export interface RetrieveSummaryMemory {
  id: string;
  title: string;
  content: string;
}

export function buildRetrieveSummaryPrompt(
  query: string,
  memories: RetrieveSummaryMemory[],
): string {
  const memoryLines =
    memories.length === 0
      ? "No memories matched."
      : memories
          .map((memory, index) => {
            const preview =
              memory.content.length > 600
                ? `${memory.content.slice(0, 600)}…`
                : memory.content;
            return `[${String(index + 1)}] ${memory.title}\n${preview}`;
          })
          .join("\n\n");

  return `You answer questions using only the user's retrieved memories. Respond with ONLY valid JSON — no thinking, no markdown.

# Task

Given a question and matching memories, write a concise answer grounded in those memories. If nothing relevant matches, say so clearly.

# Output schema

{ "summary": "your answer in 1-3 sentences" }

# Question

${query}

# Retrieved memories

${memoryLines}

# Your output (JSON only)`;
}

function readJsonString(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const field = Reflect.get(value, key);
  return typeof field === "string" && field.trim().length > 0
    ? field.trim()
    : null;
}

export function parseRetrieveSummaryResponse(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(extractJsonString(raw));
    return readJsonString(parsed, "summary");
  } catch {
    return null;
  }
}
