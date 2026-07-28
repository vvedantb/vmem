import { z } from "zod";
import { parseJsonString } from "../../engine/llm/extractJsonString";
import { truncateAtWord } from "../../engine/llm/truncateAtWord";
import type { TagUsage } from "../../engine/neo4j/memory/enrichment";
import { sanitizeTag } from "../../engine/neo4j/memory/tagNormalize";

const MAX_CONTENT_LENGTH = 2000;

const ENTITY_TYPES = ["person", "organization", "place", "technology"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// hyphens count as spaces for identity (display names keep them)
export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ")
    .trim()
    .slice(0, 100);
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

export interface KnownEntity {
  name: string;
  type: string;
}

export function buildFullEnrichmentPrompt(
  title: string,
  content: string,
  existingMemories: EnrichmentCandidate[],
  existingTags: TagUsage[] = [],
  existingEntities: KnownEntity[] = [],
): string {
  const memoryList = existingMemories
    .map((m) => `${m.id}: ${m.title}`)
    .join("\n");
  const tagVocabulary = existingTags
    .map((t) => `${t.name} (${String(t.uses)})`)
    .join(", ");
  const entityVocabulary = existingEntities
    .map((e) => `${e.name} [${e.type}]`)
    .join(", ");

  return `You are a memory tagging and entity extraction system. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

Given a memory and a list of existing memories, produce three outputs:

1. **Tags** (2-4 items): recurring THEMES this memory belongs to. Tags connect memories — they are only useful when shared across many memories.
2. **Related memory IDs**: from the provided list only — strong topical/continuation relationships.
3. **Named entities**: people, organizations, places, technologies mentioned by name.

# Core Rules

## Tags Are Themes, Entities Are Specifics

The two outputs have OPPOSITE granularity:

- ENTITIES capture the specific named things: "Ferrari 488 GTB", "Sam Altman", "OpenAI o1-preview". Never generalize an entity.
- TAGS capture the recurring theme the memory belongs to: "supercars", "ai-models", "typescript". A tag that could only ever apply to this one memory is a failed tag.

Never put a person's name, a product model, an API symbol, or a one-off event in a tag — that is what entities are for. "bianca-francesca-boorer" or "queryclientprovider" as tags are wrong; "people" is too broad; the right call is the theme ("modeling", "react-query") plus the specific entity.

## Reuse the Existing Vocabulary First

The user's existing tags (with usage counts) are listed under "Existing tag vocabulary". For every tag you consider:

1. If an existing tag fits, use it EXACTLY as written — never mint a near-duplicate ("ai-model" when "ai-models" exists, "reactjs" when "react" exists).
2. Only mint a new tag when the memory introduces a genuinely new theme that will plausibly recur in future memories.
3. Two well-chosen existing tags beat four new ones.

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

## Reuse Known Entities

The user's existing entities are listed under "Known entities". If a mention refers to one of them — including a shorthand, fuller form, or alias of it — output the EXISTING name exactly as listed. "Fable 5" in the text when "Claude Fable 5" is known → output "Claude Fable 5". Only introduce a new entity name when the mention is genuinely a different thing.

## Tag Quality

- Lowercase. Hyphenated for multi-word ("machine-learning", "web-development").
- Mid-level themes: specific enough to mean something, general enough to recur. "react" is right; "react-server-components" only if the user's vocabulary already has it; "frontend" only as a second tag, never the only one.
- Reject vague catch-alls that say nothing: "stuff", "notes", "article", "misc", "general", "other".
- Reject one-shot specifics that can never recur: model numbers, person names, API symbols, event names.

## Entity Quality

- Only entities that are explicitly named in the text.
- Use full canonical name when conventional.
- Skip vague references ("a startup", "some library", "the company") — these are not named entities.
- NEVER extract raw identifiers as entities: no URLs, hostnames, file paths, branch names, commit hashes, or email addresses. Name the underlying thing instead — "Evalucom", not "https://github.com/evalucom"; nothing at all for a git branch like "revert-411-eva/task-m57...".
- One entry per entity. If something could be classified two ways (a bot account, a repo), pick the single best type — never list it twice.
- Cap at 10 entities; pick the most specific and identifying ones if there are more.

# Worked Examples

## Example 1

Existing tag vocabulary: cars (12), supercars (8), youtube (40), reviews (5)

Memory:
Title: Ferrari 488 GTB review by Top Gear
Content: Top Gear's Chris Harris reviewed the Ferrari 488 GTB in 2016. He praised its 3.9L twin-turbo V8 engine and compared it to the McLaren 675LT.

Expected:
{"tags": ["supercars", "reviews"], "relatedMemoryIds": [], "entities": [{"name": "Ferrari 488 GTB", "type": "technology"}, {"name": "Top Gear", "type": "organization"}, {"name": "Chris Harris", "type": "person"}, {"name": "McLaren 675LT", "type": "technology"}]}

Note: "supercars" and "reviews" come straight from the vocabulary. The specifics — Ferrari 488 GTB, Top Gear, Chris Harris — are ENTITIES, not tags. "ferrari-488-gtb" or "twin-turbo-v8" as tags would each be used once and never again.

## Example 2

Existing tag vocabulary: typescript (66), react (76), web-development (37)

Memory:
Title: TypeScript 5.4 useOptimistic types
Content: TypeScript 5.4 ships with improved type inference for React 19's useOptimistic hook. The Microsoft team highlighted the NoInfer utility type as part of the same release.

Expected:
{"tags": ["typescript", "react"], "relatedMemoryIds": [], "entities": [{"name": "TypeScript", "type": "technology"}, {"name": "React", "type": "technology"}, {"name": "Microsoft", "type": "organization"}]}

Note: Both tags reuse the vocabulary exactly. "useoptimistic" and "noinfer" are API symbols — they belong in the memory content, not in tags. Two strong tags beat five weak ones.

## Example 3

Existing tag vocabulary: claude (81), llm (15), coding (9)

Memory:
Title: Anthropic releases Claude 3.5 Sonnet
Content: Anthropic announced Claude 3.5 Sonnet on June 20, 2024. CEO Dario Amodei said it outperforms GPT-4o on coding benchmarks.

Expected:
{"tags": ["claude", "llm", "ai-models"], "relatedMemoryIds": [], "entities": [{"name": "Anthropic", "type": "organization"}, {"name": "Claude 3.5 Sonnet", "type": "technology"}, {"name": "Dario Amodei", "type": "person"}, {"name": "GPT-4o", "type": "technology"}]}

Note: "claude" and "llm" reuse the vocabulary. "ai-models" is a NEW tag — justified because AI model releases are a recurring theme that future memories will share. "Claude 3.5 Sonnet" stays an entity with its full model name; "claude-3-5-sonnet" as a tag would be a one-off.

# Input

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Existing tag vocabulary (tag (uses) — reuse these when they fit):
${tagVocabulary || "(none yet — mint sensible recurring themes)"}

Known entities (name [type] — reuse the exact name for any mention of these):
${entityVocabulary || "(none yet)"}

Existing memories:
${memoryList || "(none)"}

# Output

Respond with ONLY this JSON, no other text:
{"tags": ["tag1", "tag2"], "relatedMemoryIds": ["id1"], "entities": [{"name": "React", "type": "technology"}]}`;
}

export interface ParsedFullEnrichment {
  tags: string[];
  relatedMemoryIds: string[];
  entities: ExtractedEntity[];
}

const entityTypeSchema = z.enum(ENTITY_TYPES);

const entityItemSchema = z.object({
  name: z.string().trim().min(1),
  type: entityTypeSchema,
});

const fullEnrichmentResponseSchema = z.object({
  tags: z.array(z.string().min(1)).min(1),
  relatedMemoryIds: z.unknown().optional(),
  entities: z.unknown().optional(),
});

const unknownArraySchema = z.array(z.unknown());
const relatedMemoryIdsSchema = z.array(z.string());

// parse entities from llm response
function parseEntities(raw: unknown): ExtractedEntity[] {
  const arrayResult = unknownArraySchema.safeParse(raw);
  if (!arrayResult.success) return [];
  const seen = new Set<string>();
  const result: ExtractedEntity[] = [];
  for (const item of arrayResult.data) {
    const parsed = entityItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { name, type } = parsed.data;
    const normalizedName = normalizeEntityName(name);
    // dedup on name alone (no type), entity identity in the graph is (userId, normalizedName)
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    result.push({ name, normalizedName, type });
  }
  return result.slice(0, 10);
}

function parseRelatedMemoryIds(raw: unknown): string[] {
  const related = relatedMemoryIdsSchema.safeParse(raw);
  if (!related.success) return [];
  return related.data.filter((id) => id.length > 0);
}

export function parseFullEnrichmentResponse(
  raw: string,
): ParsedFullEnrichment | null {
  const parsed = parseJsonString(raw, fullEnrichmentResponseSchema);
  if (!parsed) {
    console.error("[enrichment] Failed to parse LLM response:", raw);
    return null;
  }
  const tags = parsed.tags
    .map(sanitizeTag)
    .filter((t) => t.length > 0)
    .slice(0, 4);
  if (tags.length === 0) return null;
  return {
    tags,
    relatedMemoryIds: parseRelatedMemoryIds(parsed.relatedMemoryIds),
    entities: parseEntities(parsed.entities),
  };
}
