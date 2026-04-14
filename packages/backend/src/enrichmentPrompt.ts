const MAX_CONTENT_LENGTH = 2000;

export function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(" ", maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen);
}

export function sanitizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .slice(0, 50);
}

export interface EnrichmentCandidate {
  id: string;
  title: string;
}

export function buildFullEnrichmentPrompt(
  title: string,
  content: string,
  existingMemories: EnrichmentCandidate[],
): string {
  const memoryList = existingMemories
    .map((m) => `${m.id}: ${m.title}`)
    .join("\n");

  return `You are a memory tagging system. Given a memory and a list of existing memories:

1. Generate 3-5 semantic topic tags for this memory. Tags should be lowercase, specific, and reusable (e.g. "react", "authentication", "graph-algorithms", "typescript"). Avoid generic tags like "programming" or "article".

2. From the provided list, identify any memories that are semantically related to this one. Only include strong relationships — shared topic, continuation of the same work, or direct reference.

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing memories:
${memoryList || "(none)"}

Respond in JSON only:
{"tags": ["tag1", "tag2"], "relatedMemoryIds": ["id1"]}`;
}

function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonStr = match[1].trim();
    }
  }
  return jsonStr;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "string" && item.length > 0)
  );
}

function isStringArrayAllowEmpty(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export interface ParsedFullEnrichment {
  tags: string[];
  relatedMemoryIds: string[];
}

export function parseFullEnrichmentResponse(
  raw: string,
): ParsedFullEnrichment | null {
  try {
    const jsonStr = extractJsonString(raw);
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) return null;
    if (!("tags" in parsed)) return null;
    const tagsRaw = Reflect.get(parsed, "tags");
    const relatedRaw = Reflect.get(parsed, "relatedMemoryIds");
    if (!isNonEmptyStringArray(tagsRaw)) return null;
    const tags = tagsRaw
      .map(sanitizeTag)
      .filter((t) => t.length > 0)
      .slice(0, 5);
    if (tags.length === 0) return null;
    const relatedMemoryIds =
      relatedRaw !== undefined && isStringArrayAllowEmpty(relatedRaw)
        ? relatedRaw.filter((id) => id.length > 0)
        : [];
    return { tags, relatedMemoryIds };
  } catch {
    console.error("[enrichment] Failed to parse LLM response:", raw);
    return null;
  }
}
