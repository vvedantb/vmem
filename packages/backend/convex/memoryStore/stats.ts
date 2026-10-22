import {
  dashboardStatsFromCounts,
  isoDateUtc,
  statsWindowStartIso,
  type DashboardStatsResult,
} from "../../engine/memory/dashboardStats";
import {
  isVisibleStatus,
  memoryMatchesScope,
  type MemoryReadScope,
} from "../../engine/memory/scope";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const STAT_SHARDS = 4;

type StatKind = Doc<"memoryStatCounters">["kind"];

export type StatDoc = Pick<
  Doc<"memories">,
  | "_creationTime"
  | "memoryId"
  | "userId"
  | "profileId"
  | "createdAt"
  | "tags"
  | "status"
>;

type StatRef = {
  userId: string;
  profileId: string | undefined;
  kind: StatKind;
  key: string;
  shard: number;
};

type DeltaMap = Map<string, { ref: StatRef; delta: number }>;

function shardOf(memoryId: string): number {
  let hash = 0;
  for (let i = 0; i < memoryId.length; i += 1) {
    hash = (hash * 31 + memoryId.charCodeAt(i)) >>> 0;
  }
  return hash % STAT_SHARDS;
}

function refKey(ref: StatRef): string {
  return JSON.stringify([
    ref.userId,
    ref.profileId ?? null,
    ref.kind,
    ref.key,
    ref.shard,
  ]);
}

function addDelta(map: DeltaMap, ref: StatRef, delta: number): void {
  const key = refKey(ref);
  const existing = map.get(key);
  if (existing) existing.delta += delta;
  else map.set(key, { ref, delta });
}

// hidden rows (suppressed, archived, expired) are not counted, so a status
// change in or out of the visible set moves the counters
function addDocDeltas(map: DeltaMap, doc: StatDoc, sign: 1 | -1): void {
  if (!isVisibleStatus(doc.status)) return;
  const base = {
    userId: doc.userId,
    profileId: doc.profileId,
    shard: shardOf(doc.memoryId),
  };
  addDelta(map, { ...base, kind: "total", key: "" }, sign);
  addDelta(map, { ...base, kind: "day", key: isoDateUtc(doc.createdAt) }, sign);
  for (const tag of new Set(doc.tags)) {
    addDelta(map, { ...base, kind: "tag", key: tag }, sign);
  }
}

export async function loadStatsMeta(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"memoryStatsMeta"> | null> {
  return await ctx.db.query("memoryStatsMeta").first();
}

export function isTracked(
  meta: Doc<"memoryStatsMeta"> | null,
  doc: Pick<StatDoc, "_creationTime">,
): boolean {
  if (meta === null) return false;
  if (meta.ready) return true;
  return (
    doc._creationTime > meta.trackingSince ||
    doc._creationTime <= meta.backfilledThrough
  );
}

export async function applyStatDeltas(
  ctx: MutationCtx,
  deltas: DeltaMap,
): Promise<void> {
  for (const { ref, delta } of deltas.values()) {
    if (delta === 0) continue;
    const existing = await ctx.db
      .query("memoryStatCounters")
      .withIndex("by_bucket", (q) =>
        q
          .eq("userId", ref.userId)
          .eq("profileId", ref.profileId)
          .eq("kind", ref.kind)
          .eq("key", ref.key)
          .eq("shard", ref.shard),
      )
      .first();
    if (existing === null) {
      await ctx.db.insert("memoryStatCounters", {
        userId: ref.userId,
        ...(ref.profileId === undefined ? {} : { profileId: ref.profileId }),
        kind: ref.kind,
        key: ref.key,
        shard: ref.shard,
        count: delta,
      });
      continue;
    }
    const next = existing.count + delta;
    if (next === 0) await ctx.db.delete(existing._id);
    else await ctx.db.patch(existing._id, { count: next });
  }
}

export type StatChange = { before: StatDoc | null; after: StatDoc | null };

// Records memory writes in the counters. Safe to call for every write: it is a
// no-op until the backfill has started, and skips docs the backfill will count.
export async function trackMemoryChanges(
  ctx: MutationCtx,
  changes: readonly StatChange[],
): Promise<void> {
  if (changes.length === 0) return;
  const meta = await loadStatsMeta(ctx);
  if (meta === null) return;
  const deltas: DeltaMap = new Map();
  for (const { before, after } of changes) {
    if (before !== null && isTracked(meta, before)) {
      addDocDeltas(deltas, before, -1);
    }
    if (after !== null && isTracked(meta, after)) {
      addDocDeltas(deltas, after, 1);
    }
  }
  await applyStatDeltas(ctx, deltas);
}

export async function trackMemoryChange(
  ctx: MutationCtx,
  before: StatDoc | null,
  after: StatDoc | null,
): Promise<void> {
  await trackMemoryChanges(ctx, [{ before, after }]);
}

export function statDeltasForDocs(docs: readonly StatDoc[]): DeltaMap {
  const deltas: DeltaMap = new Map();
  for (const doc of docs) addDocDeltas(deltas, doc, 1);
  return deltas;
}

function rowInScope(
  row: Pick<Doc<"memoryStatCounters">, "userId" | "profileId">,
  scope: MemoryReadScope,
): boolean {
  return memoryMatchesScope(row, scope);
}

async function rowsForScope(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  kind: StatKind,
  fromKey: string | null,
): Promise<Array<Doc<"memoryStatCounters">>> {
  const rows =
    scope.kind === "team"
      ? await ctx.db
          .query("memoryStatCounters")
          .withIndex("by_profile_kind_key", (q) => {
            const base = q.eq("profileId", scope.profileId).eq("kind", kind);
            return fromKey === null ? base : base.gte("key", fromKey);
          })
          .collect()
      : await ctx.db
          .query("memoryStatCounters")
          .withIndex("by_user_kind_key", (q) => {
            const base = q.eq("userId", scope.userId).eq("kind", kind);
            return fromKey === null ? base : base.gte("key", fromKey);
          })
          .collect();
  return rows.filter((row) => rowInScope(row, scope));
}

// Dashboard stats for a scope from the counters, or null while they are not
// fully backfilled (callers then fall back to walking the rows).
export async function readMemoryStats(
  ctx: QueryCtx,
  scope: MemoryReadScope,
  now: number,
): Promise<DashboardStatsResult | null> {
  const meta = await loadStatsMeta(ctx);
  if (meta === null || !meta.ready) return null;
  const [totals, days, tagRows] = await Promise.all([
    rowsForScope(ctx, scope, "total", null),
    rowsForScope(ctx, scope, "day", statsWindowStartIso(now)),
    rowsForScope(ctx, scope, "tag", null),
  ]);
  let total = 0;
  for (const row of totals) total += row.count;
  const dayCounts = new Map<string, number>();
  for (const row of days) {
    dayCounts.set(row.key, (dayCounts.get(row.key) ?? 0) + row.count);
  }
  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    tagCounts.set(row.key, (tagCounts.get(row.key) ?? 0) + row.count);
  }
  const tags = new Set<string>();
  for (const [tag, count] of tagCounts) if (count > 0) tags.add(tag);
  return dashboardStatsFromCounts({ total, days: dayCounts, tags }, now);
}
