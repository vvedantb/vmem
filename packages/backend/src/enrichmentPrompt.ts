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

# Task

Given a memory and a list of existing memories, produce three outputs:

1. **Tags** (3-5 items): semantic topic labels. Lowercase, specific, reusable.
2. **Related memory IDs**: from the provided list only — strong topical/continuation relationships.
3. **Named entities**: people, organizations, places, technologies mentioned by name.

# Core Rules

## Preserve Specific Details

Tags and entities must capture the SPECIFIC subject — never generalize away identifying detail.

- If the memory mentions "Ferrari 488 GTB", the entity is "Ferrari 488 GTB" — NOT "sports car" and NOT just "Ferrari".
- If the memory mentions "TypeScript 5.4 release notes", a tag should be "typescript" (the specific tech) — NOT "programming" and NOT "article".
- If the memory mentions "OpenAI o1-preview", the entity is "OpenAI o1-preview" — NOT just "OpenAI" and NOT "AI model".
- If the memory mentions "the React 19 useOptimistic hook", a tag should be "react" or "useoptimistic" — NOT "frontend" and NOT "hooks".

Proper nouns, version numbers, model names, exact technologies, and qualifiers are the entire point. Strip them and the memory becomes useless.

## No Fabrication

Every tag and entity must trace to an explicit mention in the title or content. If a name, technology, or organization is not literally present, do NOT add it. Inferring "React" from a Next.js article is fabrication.

## No Implicit Attribute Inference

Do not infer attributes that are not stated. Do not guess gender, age, nationality, or affiliation from a person's name. If the content says "Ada wrote a paper", the entity is "Ada" with type "person" — do NOT add an "organization" entity for any university you assume Ada attended.

## Canonical Entity Names

Use the canonical full form when one is conventionally written.

- "TypeScript" not "TS" or "typescript"
- "Google" not "Google LLC" or "google"
- "Ferrari 488 GTB" not "488" or "Ferrari"
- "Sam Altman" not "altman" or "Sam A."

If the memory uses an abbreviation that has an obvious canonical form (e.g. "JS" → "JavaScript"), expand it. If there is no clear canonical form, use what the memory says verbatim.

## Tag Quality

- Lowercase. Hyphenated for multi-word ("graph-algorithms", "machine-learning").
- Specific over general — prefer "react-server-components" over "react", and "react" over "frontend".
- Reusable — should plausibly apply to other memories on the same specific topic.
- Reject generic categories: "programming", "tech", "article", "blog", "notes", "stuff".

## Entity Quality

- Only entities that are explicitly named in the text.
- Use full canonical name when conventional.
- Skip vague references ("a startup", "some library", "the company") — these are not named entities.
- Cap at 10 entities; pick the most specific and identifying ones if there are more.

# Worked Examples

## Example 1

Memory:
Title: Ferrari 488 GTB review by Top Gear
Content: Top Gear's Chris Harris reviewed the Ferrari 488 GTB in 2016. He praised its 3.9L twin-turbo V8 engine and compared it to the McLaren 675LT.

Expected:
{"tags": ["ferrari-488-gtb", "supercars", "top-gear", "twin-turbo-v8"], "relatedMemoryIds": [], "entities": [{"name": "Ferrari 488 GTB", "type": "technology"}, {"name": "Top Gear", "type": "organization"}, {"name": "Chris Harris", "type": "person"}, {"name": "McLaren 675LT", "type": "technology"}]}

Note: "supercars" is acceptable because it is a specific category — NOT "cars" which would be generic. The 488 GTB is preserved with its full model name. Chris Harris is included because he is named. We do NOT add "United Kingdom" as a place even though Top Gear is British.

## Example 2

Memory:
Title: TypeScript 5.4 useOptimistic types
Content: TypeScript 5.4 ships with improved type inference for React 19's useOptimistic hook. The Microsoft team highlighted the NoInfer utility type as part of the same release.

Expected:
{"tags": ["typescript", "react", "useoptimistic", "noinfer", "type-inference"], "relatedMemoryIds": [], "entities": [{"name": "TypeScript", "type": "technology"}, {"name": "React", "type": "technology"}, {"name": "Microsoft", "type": "organization"}]}

Note: We do NOT generalize to "programming" or "frontend". Version numbers do not become entities (TypeScript is the entity, "5.4" is just qualifier). NoInfer is a tag (concept) not an entity (not a proper noun).

## Example 3

Memory:
Title: Anthropic releases Claude 3.5 Sonnet
Content: Anthropic announced Claude 3.5 Sonnet on June 20, 2024. CEO Dario Amodei said it outperforms GPT-4o on coding benchmarks.

Expected:
{"tags": ["anthropic", "claude-3-5-sonnet", "llm", "ai-models"], "relatedMemoryIds": [], "entities": [{"name": "Anthropic", "type": "organization"}, {"name": "Claude 3.5 Sonnet", "type": "technology"}, {"name": "Dario Amodei", "type": "person"}, {"name": "GPT-4o", "type": "technology"}]}

Note: "Claude 3.5 Sonnet" preserved with the full model name — NOT just "Claude". GPT-4o is included as a technology (it is named). We do NOT infer "OpenAI" as an organization because it was not literally mentioned.

# Input

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing memories:
${memoryList || "(none)"}

# Output

Respond with ONLY this JSON, no other text:
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
