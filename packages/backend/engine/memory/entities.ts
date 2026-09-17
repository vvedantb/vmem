import { z } from "zod";
import { parseJsonString } from "../llm/extractJsonString";
import { truncateAtWord } from "../llm/truncateAtWord";
import type { MemoryLinkEdge } from "./links";
import { hasWholeWord } from "./tokens";

const ENTITY_TYPES = [
  "person",
  "organization",
  "place",
  "technology",
  "project",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

const MAX_CONTENT_LENGTH = 2000;
const MAX_ENTITIES = 10;
const MAX_RELATED_IDS = 8;
const MAX_AUTO_LINKS = 512;
const MAX_ENTITY_FANOUT = 48;
const RECENT_RELATED_CANDIDATES = 16;

const GENERIC_TAGS = new Set([
  "project",
  "project-detail",
  "fact",
  "misc",
  "config",
  "people",
  "person",
  "ownership",
  "preferences",
  "error-code",
  "tooling",
  "knowledge",
  "episodic",
  "profile",
  "article",
  "notes",
  "general",
]);

const GENERIC_ENTITY_TOKENS = new Set([
  "the",
  "this",
  "that",
  "these",
  "those",
  "a",
  "an",
  "our",
  "my",
  "your",
  "their",
  "team",
  "project",
  "overview",
  "initiative",
  "memory",
  "user",
  "note",
  "notes",
  "fact",
  "detail",
  "year",
  "first",
  "major",
  "when",
  "for",
  "as",
  "after",
  "before",
  "during",
  "while",
  "historically",
  "customer",
  "planning",
  "missing",
  "error",
  "service",
  "request",
  "what",
  "who",
  "how",
  "where",
  "use",
  "using",
  "used",
  "prefer",
  "prefers",
  "preferred",
  "live",
  "lives",
  "lived",
  "based",
  "store",
  "stores",
  "stored",
  "gate",
  "gates",
  "run",
  "runs",
  "own",
  "owns",
  "build",
  "built",
  "operate",
  "operated",
  "chose",
  "choose",
  "ship",
  "ships",
  "cover",
  "covers",
  "lead",
  "leads",
  "chair",
  "chairs",
  "manage",
  "manages",
  "carry",
  "carries",
  "respond",
  "responds",
  "currently",
]);

type EntityMatch = "token" | "team" | "project";

export interface ExtractedEntity {
  name: string;
  normalizedName: string;
  type: EntityType;
  match: EntityMatch;
}

export interface KnownEntity {
  name: string;
  normalizedName: string;
  type: string;
}

export interface EntityExtractionCandidate {
  id: string;
  title: string;
  tags?: readonly string[];
}

interface ParsedEntityExtraction {
  entities: ExtractedEntity[];
  relatedMemoryIds: string[];
}

export interface RelatedMemorySuggestion {
  id: string;
  reason: string;
}

const entityTypeSchema = z.enum(ENTITY_TYPES);
const entityTypeLooseSchema = entityTypeSchema.catch("technology");
const unknownArraySchema = z.array(z.unknown());
const stringArraySchema = z.array(z.string());

const entityItemSchema = z.object({
  name: z.string().trim().min(1),
  type: entityTypeLooseSchema,
});

const entityExtractionResponseSchema = z.object({
  entities: unknownArraySchema.optional(),
  relatedMemoryIds: z.unknown().optional(),
});

function normalizeEntityName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, " ")
    .trim()
    .slice(0, 100);
}

function isGenericToken(token: string): boolean {
  return token.length < 3 || GENERIC_ENTITY_TOKENS.has(token.toLowerCase());
}

function pushEntity(
  out: ExtractedEntity[],
  seen: Set<string>,
  name: string,
  type: EntityType,
  match: EntityMatch,
): void {
  const trimmed = name.trim();
  if (trimmed.length < 2) return;
  const normalizedName = normalizeEntityName(trimmed);
  if (normalizedName.length < 3 || isGenericToken(normalizedName)) return;
  if (seen.has(normalizedName)) return;
  seen.add(normalizedName);
  out.push({ name: trimmed.slice(0, 100), normalizedName, type, match });
}

function extractQuoted(
  text: string,
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  const quoted = text.matchAll(/"([^"]{3,80})"|'([^']{3,80})'/g);
  for (const match of quoted) {
    const raw = match[1] ?? match[2];
    if (raw === undefined) continue;
    if (/https?:\/\//i.test(raw)) continue;
    pushEntity(out, seen, raw, "technology", "token");
  }
}

function extractTeamPhrases(
  text: string,
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  const theOrg =
    /\bthe\s+([A-Za-z][A-Za-z0-9-]{1,30}(?:\s+[A-Za-z][A-Za-z0-9-]{1,30}){0,2}?)\s+(?:support desk|cost centre|cost center|on-call|team|board|group|desk|rota|budget)\b/gi;
  for (const match of text.matchAll(theOrg)) {
    const raw = match[1];
    if (raw === undefined) continue;
    pushEntity(out, seen, raw, "organization", "team");
  }
  const onCall = /\b([A-Za-z][A-Za-z0-9-]{1,30})\s+on-call\b/gi;
  for (const match of text.matchAll(onCall)) {
    const raw = match[1];
    if (raw === undefined) continue;
    pushEntity(out, seen, raw, "organization", "team");
  }
}

function mentionsOrganization(text: string, normalizedName: string): boolean {
  const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^a-z0-9])(?:the\\s+)?${escaped}\\s+(?:support desk|cost centre|cost center|on-call|team|board|group|desk|rota|budget)(?:$|[^a-z0-9])`,
    "i",
  ).test(text);
}

function extractProjectPhrases(
  title: string,
  content: string,
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  const overviewName = projectOverviewName(title);
  if (overviewName !== null) {
    pushEntity(out, seen, overviewName, "project", "project");
  }
  const pattern = /\b([A-Za-z][A-Za-z0-9-]{2,40})\s+project\b/g;
  for (const match of `${title}\n${content}`.matchAll(pattern)) {
    const raw = match[1];
    if (raw === undefined) continue;
    if (isGenericToken(raw)) continue;
    pushEntity(out, seen, raw, "project", "project");
  }
}

function extractProperNames(
  text: string,
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  const pattern =
    /\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){0,3})(?:\s+(\d+[A-Za-z0-9-]*))?/g;
  for (const match of text.matchAll(pattern)) {
    const head = match[1];
    if (head === undefined) continue;
    const withVersion = match[2] === undefined ? head : `${head} ${match[2]}`;
    const first = head.split(/\s+/)[0] ?? head;
    if (isGenericToken(first)) continue;
    const type: EntityType =
      head.split(/\s+/).length >= 2 ? "person" : "technology";
    pushEntity(out, seen, withVersion, type, "token");
  }
}

function extractFromTags(
  tags: readonly string[],
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (GENERIC_TAGS.has(normalized) || normalized.includes("-")) continue;
    if (normalized.length < 4) continue;
    pushEntity(out, seen, tag, "project", "token");
  }
}

function extractKnownMentions(
  text: string,
  known: readonly KnownEntity[],
  out: ExtractedEntity[],
  seen: Set<string>,
): void {
  const lower = text.toLowerCase();
  for (const entity of known) {
    if (seen.has(entity.normalizedName)) continue;
    if (entity.normalizedName.length < 3) continue;
    const type = entityTypeLooseSchema.parse(entity.type);
    const isTeam = type === "organization";
    const isProject = type === "project";
    const hit = isTeam
      ? mentionsOrganization(lower, entity.normalizedName)
      : isProject
        ? hasWholeWord(lower, `${entity.normalizedName} project`) ||
          hasWholeWord(lower, entity.normalizedName)
        : hasWholeWord(lower, entity.normalizedName);
    if (!hit) continue;
    const match: EntityMatch = isTeam
      ? "team"
      : isProject
        ? "project"
        : "token";
    pushEntity(out, seen, entity.name, type, match);
  }
}

export function extractEntitiesFallback(input: {
  title: string;
  content: string;
  tags?: readonly string[];
  knownEntities?: readonly KnownEntity[];
}): ExtractedEntity[] {
  const text = `${input.title}\n${input.content}`;
  const out: ExtractedEntity[] = [];
  const seen = new Set<string>();
  extractQuoted(text, out, seen);
  extractTeamPhrases(text, out, seen);
  extractProjectPhrases(input.title, input.content, out, seen);
  extractProperNames(text, out, seen);
  extractFromTags(input.tags ?? [], out, seen);
  if (input.knownEntities !== undefined && input.knownEntities.length > 0) {
    extractKnownMentions(text, input.knownEntities, out, seen);
  }
  return out.slice(0, MAX_ENTITIES);
}

export function mergeExtractedEntities(
  ...lists: readonly (readonly ExtractedEntity[])[]
): ExtractedEntity[] {
  const seen = new Set<string>();
  const out: ExtractedEntity[] = [];
  for (const list of lists) {
    for (const entity of list) {
      if (seen.has(entity.normalizedName)) continue;
      seen.add(entity.normalizedName);
      out.push(entity);
      if (out.length >= MAX_ENTITIES) return out;
    }
  }
  return out;
}

function parseEntities(raw: unknown): ExtractedEntity[] {
  const arrayResult = unknownArraySchema.safeParse(raw);
  if (!arrayResult.success) return [];
  const seen = new Set<string>();
  const result: ExtractedEntity[] = [];
  for (const item of arrayResult.data) {
    const parsed = entityItemSchema.safeParse(item);
    if (!parsed.success) continue;
    pushEntity(
      result,
      seen,
      parsed.data.name,
      parsed.data.type,
      parsed.data.type === "organization"
        ? "team"
        : parsed.data.type === "project"
          ? "project"
          : "token",
    );
  }
  return result.slice(0, MAX_ENTITIES);
}

function parseRelatedMemoryIds(raw: unknown): string[] {
  const related = stringArraySchema.safeParse(raw);
  if (!related.success) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const id of related.data) {
    const trimmed = id.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ids.push(trimmed);
    if (ids.length >= MAX_RELATED_IDS) break;
  }
  return ids;
}

export function parseEntityExtractionResponse(
  raw: string,
): ParsedEntityExtraction | null {
  const parsed = parseJsonString(raw, entityExtractionResponseSchema);
  if (!parsed) return null;
  return {
    entities: parseEntities(parsed.entities),
    relatedMemoryIds: parseRelatedMemoryIds(parsed.relatedMemoryIds),
  };
}

export function buildEntityExtractionPrompt(
  title: string,
  content: string,
  existingMemories: readonly EntityExtractionCandidate[],
  existingEntities: readonly KnownEntity[] = [],
): string {
  const memoryList = existingMemories
    .map((memory) => `${memory.id}: ${memory.title}`)
    .join("\n");
  const entityVocabulary = existingEntities
    .map((entity) => `${entity.name} [${entity.type}]`)
    .join(", ");

  return `You are a memory entity and relation extractor. Respond with ONLY a JSON object — no explanation, no thinking, no markdown.

# Task

From one memory, extract:
1. **Named entities**: people, organizations/teams, places, technologies, projects mentioned by name.
2. **Related memory IDs**: from the provided list only — strong continuation or "detail of" relationships.

# Rules

- Every entity must be literally present in the title or content. Do not infer affiliation or extra names.
- Reuse Known entities' exact names when the mention is the same thing (including shorthand).
- Skip vague references ("a startup", "the team") and raw URLs, paths, emails, commit hashes.
- Teams mentioned as "the X team" → entity name X, type organization.
- Titles like "Helios project overview" → entity Helios, type project.
- Cap at 10 entities. relatedMemoryIds must be ids from Existing memories only.

# Input

Memory:
Title: ${title}
Content: ${truncateAtWord(content, MAX_CONTENT_LENGTH)}

Known entities (reuse exact names):
${entityVocabulary || "(none yet)"}

Existing memories:
${memoryList || "(none)"}

# Output

{"entities":[{"name":"Helios","type":"project"}],"relatedMemoryIds":["id1"]}`;
}

export function projectOverviewName(title: string): string | null {
  const match = /^(.{2,80}?)\s+project overview$/i.exec(title.trim());
  const name = match?.[1]?.trim();
  if (name === undefined || name.length === 0) return null;
  return name;
}

function looksLikeProjectDetail(
  title: string,
  content: string,
  tags: readonly string[] = [],
): boolean {
  if (tags.includes("project-detail")) return true;
  const text = `${title}\n${content}`;
  if (!/\bteam\b/i.test(text)) return false;
  return /\b(initiative|feature flag|on-call|rollout)\b/i.test(text);
}

export function suggestRelatedMemoryIds(input: {
  title: string;
  content: string;
  tags?: readonly string[];
  candidates: readonly EntityExtractionCandidate[];
}): RelatedMemorySuggestion[] {
  const suggestions: RelatedMemorySuggestion[] = [];
  const seen = new Set<string>();
  const push = (id: string, reason: string): void => {
    if (id.length === 0 || seen.has(id)) return;
    seen.add(id);
    suggestions.push({ id, reason });
  };

  const haystack = `${input.title}\n${input.content}`;
  if (looksLikeProjectDetail(input.title, input.content, input.tags ?? [])) {
    for (let i = input.candidates.length - 1; i >= 0; i -= 1) {
      const candidate = input.candidates[i];
      if (candidate === undefined) continue;
      const project = projectOverviewName(candidate.title);
      if (project === null) continue;
      push(candidate.id, `detail of ${project}`);
      break;
    }
  }

  const window = input.candidates.slice(-RECENT_RELATED_CANDIDATES);
  for (const candidate of window) {
    if (candidate.id.length === 0) continue;
    const distinctive = projectOverviewName(candidate.title) ?? candidate.title;
    if (distinctive.length < 4) continue;
    if (hasWholeWord(haystack, distinctive)) {
      push(candidate.id, `mentions ${candidate.title}`);
    }
  }

  return suggestions.slice(0, MAX_RELATED_IDS);
}

function orderedPair(
  a: string,
  b: string,
): { sourceId: string; targetId: string } {
  return a < b ? { sourceId: a, targetId: b } : { sourceId: b, targetId: a };
}

function linksFromEntityMentions(
  mentionsByEntity: ReadonlyMap<string, readonly string[]>,
  names: ReadonlyMap<string, string>,
): MemoryLinkEdge[] {
  const seen = new Set<string>();
  const links: MemoryLinkEdge[] = [];
  for (const [normalized, memoryIds] of mentionsByEntity) {
    if (memoryIds.length < 2 || memoryIds.length > MAX_ENTITY_FANOUT) continue;
    const reason = names.get(normalized) ?? normalized;
    for (let i = 0; i < memoryIds.length; i += 1) {
      const left = memoryIds[i];
      if (left === undefined) continue;
      for (let j = i + 1; j < memoryIds.length; j += 1) {
        const right = memoryIds[j];
        if (right === undefined) continue;
        const { sourceId, targetId } = orderedPair(left, right);
        const key = `${sourceId}|${targetId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ sourceId, targetId, reason });
        if (links.length >= MAX_AUTO_LINKS) return links;
      }
    }
  }
  return links;
}

export function autoLinksFromMemories(
  memories: readonly {
    id: string;
    title: string;
    content: string;
    tags?: readonly string[];
  }[],
): MemoryLinkEdge[] {
  const mentions = new Map<string, string[]>();
  const names = new Map<string, string>();
  const seenPairs = new Set<string>();
  const links: MemoryLinkEdge[] = [];

  const addLink = (left: string, right: string, reason: string): void => {
    if (left === right) return;
    const { sourceId, targetId } = orderedPair(left, right);
    const key = `${sourceId}|${targetId}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    links.push({ sourceId, targetId, reason });
  };

  const written: EntityExtractionCandidate[] = [];
  const known: KnownEntity[] = [];
  for (const memory of memories) {
    const entities = extractEntitiesFallback({
      title: memory.title,
      content: memory.content,
      tags: memory.tags,
      knownEntities: known,
    });
    for (const entity of entities) {
      const ids = mentions.get(entity.normalizedName);
      if (ids) ids.push(memory.id);
      else mentions.set(entity.normalizedName, [memory.id]);
      if (!names.has(entity.normalizedName)) {
        names.set(entity.normalizedName, entity.name);
        known.push({
          name: entity.name,
          normalizedName: entity.normalizedName,
          type: entity.type,
        });
      }
    }
    for (const related of suggestRelatedMemoryIds({
      title: memory.title,
      content: memory.content,
      tags: memory.tags,
      candidates: written.slice(-RECENT_RELATED_CANDIDATES),
    })) {
      addLink(memory.id, related.id, related.reason);
    }
    written.push({
      id: memory.id,
      title: memory.title,
      tags: memory.tags,
    });
  }

  for (const link of linksFromEntityMentions(mentions, names)) {
    addLink(link.sourceId, link.targetId, link.reason);
  }
  return links;
}
