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

const ENTITY_TYPES = ["person", "organization", "place", "technology"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function normalizeEntityName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 100);
}

export interface ExtractedEntity {
  name: string;
  normalizedName: string;
  type: EntityType;
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

  return `You are a memory tagging and entity extraction system. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

Given a memory and a list of existing memories:

1. Generate 3-5 semantic topic tags for this memory. Tags should be lowercase, specific, and reusable (e.g. "react", "authentication", "graph-algorithms", "typescript"). Avoid generic tags like "programming" or "article".

2. From the provided list, identify any memories that are semantically related to this one. Only include strong relationships — shared topic, continuation of the same work, or direct reference.

3. Extract named entities mentioned in this memory. For each, provide name and type.
   Types: "person", "organization", "place", "technology".
   Use canonical names (e.g. "TypeScript" not "TS", "Google" not "google LLC").
   Only extract specific named entities, not vague references.

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing memories:
${memoryList || "(none)"}

Respond with ONLY this JSON format, nothing else:
{"tags": ["tag1", "tag2"], "relatedMemoryIds": ["id1"], "entities": [{"name": "React", "type": "technology"}]}`;
}

function extractJsonString(raw: string): string {
  let jsonStr = raw.trim();

  // Strip <think>...</think> blocks (Qwen3 and other thinking models)
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip unclosed <think> blocks (model hit token limit mid-thought)
  if (jsonStr.startsWith("<think>")) {
    const closeIdx = jsonStr.indexOf("</think>");
    if (closeIdx === -1) {
      // Entire response is inside an unclosed think block — try to
      // salvage JSON after the tag if there's any
      jsonStr = jsonStr.slice(7).trim();
    }
  }

  // Strip markdown code blocks
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
  entities: ExtractedEntity[];
}

function isValidEntityType(t: string): t is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(t);
}

/**
 * Parse entities from LLM response. Gracefully returns [] when the field is
 * missing or malformed — backward compatible with models that don't emit it.
 */
function parseEntities(raw: unknown): ExtractedEntity[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: ExtractedEntity[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const name = Reflect.get(item, "name");
    const type = Reflect.get(item, "type");
    if (typeof name !== "string" || name.trim().length === 0) continue;
    if (typeof type !== "string" || !isValidEntityType(type)) continue;
    const normalizedName = normalizeEntityName(name);
    const dedupKey = `${normalizedName}:${type}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    result.push({ name: name.trim(), normalizedName, type });
  }
  return result.slice(0, 10);
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
    const entitiesRaw = Reflect.get(parsed, "entities");
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
    const entities = parseEntities(entitiesRaw);
    return { tags, relatedMemoryIds, entities };
  } catch {
    console.error("[enrichment] Failed to parse LLM response:", raw);
    return null;
  }
}
