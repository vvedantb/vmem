/**
 * Pure mapping helpers — Neo4j record / property → typed shape.
 * Cross-cutting use is the whole point: every module that reads from
 * Neo4j ends up needing one or more of these.
 */

import crypto from "node:crypto";
import { type Record as NeoRecord } from "neo4j-driver";
import {
  type MemoryEvent,
  type MemorySnapshot,
  type MemoryType,
  type MemoryWithTags,
  type TagEdge,
  type TimelineEvent,
} from "./types";

function parseJsonField<T>(val: string | null): T | null {
  if (val === null) return null;
  return JSON.parse(val) as T;
}

/**
 * Reciprocal Rank Fusion score. Rank is 1-indexed. The constant k=60 is
 * the value from Cormack et al. ("Reciprocal Rank Fusion outperforms
 * Condorcet and individual Rank Learning Methods", SIGIR '09) — it
 * dampens the contribution of high-rank results while keeping lower
 * ranks meaningful. RRF is robust to scale differences between fulltext
 * BM25 scores and cosine-similarity scores, which is why we use ranks
 * instead of the raw score numbers when combining the two legs.
 */
export function rrfScore(rank: number, k = 60): number {
  return 1 / (k + rank);
}

/**
 * Age-in-days → recency multiplier. Small fixed buckets keep recent
 * knowledge (last week) near the top while not penalising older
 * reference memories too harshly.
 */
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

/**
 * Narrow a raw Neo4j property value to `MemoryType | undefined`. Returns
 * undefined for nulls and any unrecognized string (future-proof against new
 * type values landing in the DB before the frontend knows about them).
 */
export function toMemoryTypeOrUndefined(
  val: string | null,
): MemoryType | undefined {
  if (val === "profile" || val === "episodic" || val === "knowledge") {
    return val;
  }
  return undefined;
}

export function toNeoInt(val: number | { toNumber(): number }): number {
  if (typeof val === "number") return val;
  return val.toNumber();
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

export function toEventFromNode(props: {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  snapshot: string | null;
  details: string | null;
}): MemoryEvent {
  return {
    id: props.id,
    action: props.action,
    actor: props.actor,
    createdAt: props.createdAt,
    snapshot: parseJsonField<MemorySnapshot>(props.snapshot),
    details: parseJsonField<Record<string, string>>(props.details),
  };
}

export function toMemoryWithTags(record: NeoRecord): MemoryWithTags {
  const obj = record.toObject();
  const props = obj.m.properties;
  return {
    id: props.id,
    userId: props.userId,
    profileId: props.profileId ?? null,
    title: props.title,
    content: props.content,
    type: props.type,
    source: props.source,
    confidence: props.confidence,
    status: props.status,
    createdAt: props.createdAt,
    updatedAt: props.updatedAt,
    expiresAt: props.expiresAt ?? null,
    tags: obj.tags ?? [],
  };
}

export function toTimelineEvent(record: NeoRecord): TimelineEvent {
  return {
    ...toEventFromNode(record.get("e").properties),
    memoryId: String(record.get("memoryId") ?? ""),
    memoryTitle: String(record.get("memoryTitle") ?? ""),
  };
}

/**
 * Parse a Neo4j record returned by the tag-edge Cypher query into a typed
 * TagEdge. The Cypher-side computation enforces:
 *   - Each pair appears once (m1.id < m2.id ordering).
 *   - weight >= 2 (at least two shared tags).
 *   - sharedTags capped at 5 via list slicing.
 *   - Popular tags with > 500 memories are pre-filtered out to prevent
 *     combinatorial explosion on blown-out tags like "misc".
 */
export function toTagEdge(record: NeoRecord): TagEdge {
  const rawShared = record.get("sharedTags");
  const sharedTags = Array.isArray(rawShared)
    ? rawShared.filter(Boolean).map(String)
    : [];
  return {
    source: String(record.get("source")),
    target: String(record.get("target")),
    weight: toNeoInt(record.get("weight")),
    sharedTags,
  };
}

/**
 * Normalize title+content into a stable string for hashing. Trims whitespace,
 * collapses runs of whitespace to a single space, and lowercases — so trivial
 * formatting differences ("  vmem " vs "vmem") produce the same hash.
 */
function normalizeForHash(title: string, content: string): string {
  return `${title}\n${content}`.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * MD5 hex digest of the normalized title+content. Used for exact-duplicate
 * detection at creation time — Mem0-style hash dedup with zero API cost.
 */
export function computeContentHash(title: string, content: string): string {
  return crypto
    .createHash("md5")
    .update(normalizeForHash(title, content))
    .digest("hex");
}
