import crypto from "node:crypto";
import type { Record as NeoRecord } from "neo4j-driver";
import { z } from "zod";
import {
  neo4jGet,
  neo4jString,
  parseNeo4jInt,
  parseNeo4jNodeProps,
} from "../record";
import type {
  MemoryEvent,
  MemoryStatus,
  MemoryType,
  MemoryWithTags,
  TagEdge,
  TimelineEvent,
} from "./types";

export const memoryTypeSchema = z.enum(["profile", "episodic", "knowledge"]);
export const memoryStatusSchema = z.enum([
  "active",
  "pinned",
  "suppressed",
  "expired",
]);

const nullableStringSchema: z.ZodType<string | null, z.ZodTypeDef, unknown> =
  z.preprocess((value) => value ?? null, z.string().nullable());

type MemoryNodeProps = Omit<MemoryWithTags, "tags">;

const memoryNodePropsSchema: z.ZodType<MemoryNodeProps, z.ZodTypeDef, unknown> =
  z.object({
    id: z.string(),
    userId: z.string(),
    profileId: nullableStringSchema,
    title: z.string(),
    content: z.string(),
    type: memoryTypeSchema,
    source: z.string(),
    sourceType: nullableStringSchema,
    sourceId: nullableStringSchema,
    sourceUrl: nullableStringSchema,
    sourceSyncedAt: nullableStringSchema,
    confidence: z.number(),
    status: memoryStatusSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    expiresAt: nullableStringSchema,
  });

const memoryEventPropsSchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.string(),
  createdAt: z.string(),
  snapshot: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
});

const memorySnapshotSchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string(),
  status: z.string(),
  confidence: z.number(),
  tags: z.array(z.string()),
});

const tagsArraySchema = z.array(z.string());

const detailsRecordSchema = z.record(z.string(), z.string());

function parseJsonField<T>(
  val: string | null | undefined,
  schema: z.ZodType<T>,
): T | null {
  if (val === null || val === undefined) return null;
  try {
    // JSON.parse is typed `any` — re-enter as unknown for zod
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- JSON.parse
    const raw: unknown = JSON.parse(val);
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// AI-generated (Claude), prompt: "define classic rrf score and type aware recency decay for profile knowledge and episodic memories"
// Modified by me: picked age buckets to match product freshness expectations
export function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}

export function recencyFromAgeDays(age: number, type: MemoryType): number {
  if (type === "profile") return 1.0;
  if (age < 1) return 1.0;
  if (type === "knowledge") {
    if (age < 7) return 1.0;
    if (age < 30) return 0.9;
    if (age < 90) return 0.7;
    return 0.5;
  }
  if (age < 7) return 0.9;
  if (age < 30) return 0.7;
  if (age < 90) return 0.5;
  return 0.3;
}

export function toMemoryTypeOrUndefined(
  val: string | null | undefined,
): MemoryType | undefined {
  if (val === null || val === undefined) return undefined;
  const parsed = memoryTypeSchema.safeParse(val);
  return parsed.success ? parsed.data : undefined;
}

export function toMemoryStatusOrUndefined(
  val: string | null | undefined,
): MemoryStatus | undefined {
  if (val === null || val === undefined) return undefined;
  const parsed = memoryStatusSchema.safeParse(val);
  return parsed.success ? parsed.data : undefined;
}

export function toSnapshot(
  m: Pick<
    MemoryWithTags,
    "title" | "content" | "type" | "status" | "confidence" | "tags"
  >,
): string {
  return JSON.stringify({
    title: m.title,
    content: m.content,
    type: m.type,
    status: m.status,
    confidence: m.confidence,
    tags: m.tags,
  });
}

function toEventFromNode(
  props: z.infer<typeof memoryEventPropsSchema>,
): MemoryEvent {
  return {
    id: props.id,
    action: props.action,
    actor: props.actor,
    createdAt: props.createdAt,
    snapshot: parseJsonField(props.snapshot, memorySnapshotSchema),
    details: parseJsonField(props.details, detailsRecordSchema),
  };
}

export function toMemoryWithTags(record: NeoRecord): MemoryWithTags {
  const props = parseNeo4jNodeProps(
    neo4jGet(record, "m"),
    memoryNodePropsSchema,
  );
  const tagsParsed = tagsArraySchema.safeParse(neo4jGet(record, "tags"));
  return {
    ...props,
    tags: tagsParsed.success ? tagsParsed.data : [],
  };
}

export function toTimelineEvent(record: NeoRecord): TimelineEvent {
  const eventProps = parseNeo4jNodeProps(
    neo4jGet(record, "e"),
    memoryEventPropsSchema,
  );
  return {
    ...toEventFromNode(eventProps),
    memoryId: neo4jString(record, "memoryId"),
    memoryTitle: neo4jString(record, "memoryTitle"),
  };
}

export function toTagEdge(record: NeoRecord): TagEdge {
  const rawShared = neo4jGet(record, "sharedTags");
  const sharedTags = Array.isArray(rawShared)
    ? rawShared.filter(Boolean).map(String)
    : [];
  return {
    source: neo4jString(record, "source"),
    target: neo4jString(record, "target"),
    weight: parseNeo4jInt(neo4jGet(record, "weight")),
    sharedTags,
  };
}

export function computeContentHash(title: string, content: string): string {
  const normalized = `${title}\n${content}`
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  return crypto.createHash("md5").update(normalized).digest("hex");
}
