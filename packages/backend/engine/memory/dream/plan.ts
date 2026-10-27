import type { MemoryStatus } from "@vmem/sdk";
import { browseKey, canonicalUrl } from "@vmem/shared";
import { isLowPriorSource } from "../usefulness";
import { chooseKeeper, keeperOrder } from "./merge";

// one-off cleanup planning: keyed buckets (exact hash, browse key) and
// candidate groups for the Jev duplicate pass. Never all-pairs.

export const PLAN_TITLE_CHARS = 80;
export const PLAN_LOSER_TITLES = 5;
export const AI_GROUP_MAX_MEMBERS = 6;
export const NEIGHBOUR_MIN_SCORE = 0.9;
export const SAMPLE_DETERMINISTIC_GROUPS = 50;
export const SAMPLE_AI_GROUPS = 50;

// the slim row the planner keeps per memory (no content)
export interface PlanRow<M extends string> {
  _id: M;
  memoryId: string;
  title: string;
  contentLength: number;
  contentHash: string;
  url?: string;
  source: string;
  sourceType?: string;
  status: MemoryStatus;
  createdAt: number;
}

export type DeterministicRule = "exact" | "key";

export interface DeterministicGroup<M extends string> {
  rules: DeterministicRule[];
  keeperId: M;
  loserIds: M[];
  // browse key / bookmark key written to the keeper's sourceId on apply
  sourceKey?: string;
  keeperTitle: string;
  loserTitles: string[];
}

// the planner row of a memory doc; optional fields stay absent, not undefined
export function toPlanRow<M extends string>(doc: {
  _id: M;
  memoryId: string;
  title: string;
  content: string;
  contentHash: string;
  url?: string;
  source: string;
  sourceType?: string;
  status: MemoryStatus;
  createdAt: number;
}): PlanRow<M> {
  return {
    _id: doc._id,
    memoryId: doc.memoryId,
    title: doc.title,
    contentLength: doc.content.length,
    contentHash: doc.contentHash,
    ...(doc.url === undefined ? {} : { url: doc.url }),
    source: doc.source,
    ...(doc.sourceType === undefined ? {} : { sourceType: doc.sourceType }),
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

export function deterministicReason(
  rules: readonly DeterministicRule[],
): string {
  if (rules.includes("exact") && rules.includes("key")) {
    return "Same content and same page";
  }
  return rules.includes("exact") ? "Same content" : "Same page";
}

export function planTitle(title: string): string {
  return title.length > PLAN_TITLE_CHARS
    ? `${title.slice(0, PLAN_TITLE_CHARS - 1)}…`
    : title;
}

function hasSource(
  row: { source: string; sourceType?: string },
  name: string,
): boolean {
  return row.source === name || row.sourceType === name;
}

/**
 * Rule B key, recomputed from url + title: browse key for browsing history,
 * `bookmark|<canonical url>` for bookmarks (what the extension now sends as
 * externalId). Undefined for other sources or rows with no url.
 */
export function sourceKeyOf(row: {
  source: string;
  sourceType?: string;
  url?: string;
  title: string;
}): string | undefined {
  const url = row.url?.trim();
  if (!url) return undefined;
  if (hasSource(row, "browsing-history")) {
    return browseKey({ url, title: row.title });
  }
  if (hasSource(row, "bookmarks")) return `bookmark|${canonicalUrl(url)}`;
  return undefined;
}

class UnionFind<K> {
  private readonly parent = new Map<K, K>();

  find(key: K): K {
    let root = key;
    for (;;) {
      const next = this.parent.get(root);
      if (next === undefined || next === root) break;
      root = next;
    }
    this.parent.set(key, root);
    return root;
  }

  union(a: K, b: K): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

function bucketBy<T>(
  items: readonly T[],
  keyOf: (item: T) => string | undefined,
): T[][] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === undefined || key.length === 0) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  return [...buckets.values()].filter((bucket) => bucket.length > 1);
}

/**
 * Rules A (same contentHash) and B (same source key) as keyed buckets;
 * buckets that share a row are unioned into one group. Keeper: the oldest
 * pinned row, else the oldest row. Other pinned rows stay out of the group,
 * so a pinned row is never a loser.
 */
export function buildDeterministicGroups<M extends string>(
  rows: readonly PlanRow<M>[],
): DeterministicGroup<M>[] {
  const uf = new UnionFind<M>();
  const rulesByRow = new Map<M, Set<DeterministicRule>>();
  const addBuckets = (buckets: PlanRow<M>[][], rule: DeterministicRule) => {
    for (const bucket of buckets) {
      for (const row of bucket) {
        uf.union(bucket[0]?._id ?? row._id, row._id);
        const rules = rulesByRow.get(row._id) ?? new Set();
        rules.add(rule);
        rulesByRow.set(row._id, rules);
      }
    }
  };
  addBuckets(
    bucketBy(rows, (row) => row.contentHash),
    "exact",
  );
  addBuckets(bucketBy(rows, sourceKeyOf), "key");

  const components = new Map<M, PlanRow<M>[]>();
  for (const row of rows) {
    if (!rulesByRow.has(row._id)) continue;
    const root = uf.find(row._id);
    const members = components.get(root);
    if (members) members.push(row);
    else components.set(root, [row]);
  }

  const groups: DeterministicGroup<M>[] = [];
  for (const members of components.values()) {
    const pinned = members
      .filter((row) => row.status === "pinned")
      .sort(keeperOrder);
    const unpinned = members.filter((row) => row.status !== "pinned");
    const pool = pinned[0] ? [pinned[0], ...unpinned] : unpinned;
    const keeper = chooseKeeper(pool);
    if (!keeper || pool.length < 2) continue;
    const losers = pool.filter((row) => row !== keeper).sort(keeperOrder);
    const rules = new Set<DeterministicRule>();
    for (const row of members) {
      for (const rule of rulesByRow.get(row._id) ?? []) rules.add(rule);
    }
    groups.push({
      rules: [...rules].sort(),
      keeperId: keeper._id,
      loserIds: losers.map((row) => row._id),
      sourceKey: sourceKeyOf(keeper),
      keeperTitle: planTitle(keeper.title),
      loserTitles: losers
        .slice(0, PLAN_LOSER_TITLES)
        .map((row) => planTitle(row.title)),
    });
  }
  return groups.sort(
    (a, b) =>
      b.loserIds.length - a.loserIds.length ||
      (a.keeperId < b.keeperId ? -1 : a.keeperId > b.keeperId ? 1 : 0),
  );
}

export interface DeterministicStats {
  exactGroups: number;
  keyGroups: number;
  bothGroups: number;
  groups: number;
  rowsToSuppress: number;
}

export function deterministicStats<M extends string>(
  groups: readonly DeterministicGroup<M>[],
): DeterministicStats {
  const has = (group: DeterministicGroup<M>, rule: DeterministicRule) =>
    group.rules.includes(rule);
  return {
    exactGroups: groups.filter((g) => has(g, "exact") && !has(g, "key")).length,
    keyGroups: groups.filter((g) => has(g, "key") && !has(g, "exact")).length,
    bothGroups: groups.filter((g) => has(g, "exact") && has(g, "key")).length,
    groups: groups.length,
    rowsToSuppress: groups.reduce((sum, g) => sum + g.loserIds.length, 0),
  };
}

/**
 * Rows the Jev pass may look at: visible, not already a loser in rule A/B,
 * not a low-prior source (browsing history, bookmarks, desktop).
 */
export function aiEligibleRows<M extends string>(
  rows: readonly PlanRow<M>[],
  groups: readonly DeterministicGroup<M>[],
): PlanRow<M>[] {
  const losers = new Set(groups.flatMap((group) => group.loserIds));
  return rows.filter(
    (row) =>
      !losers.has(row._id) && !isLowPriorSource(row.source, row.sourceType),
  );
}

export interface CandidateEdge<M extends string> {
  a: M;
  b: M;
  // cosine score for vector edges; entity edges have none
  score?: number;
}

/**
 * Edges between rows that share an entity. Entities mentioned by more rows
 * than fit in one Jev group are too broad to mean "duplicate" and are skipped.
 */
export function entityEdges<M extends string>(
  mentions: ReadonlyArray<{ rowId: M; entityId: string }>,
): CandidateEdge<M>[] {
  const byEntity = new Map<string, Set<M>>();
  for (const mention of mentions) {
    const rows = byEntity.get(mention.entityId) ?? new Set<M>();
    rows.add(mention.rowId);
    byEntity.set(mention.entityId, rows);
  }
  const edges: CandidateEdge<M>[] = [];
  for (const rows of byEntity.values()) {
    if (rows.size < 2 || rows.size > AI_GROUP_MAX_MEMBERS) continue;
    const ids = [...rows].sort();
    for (let i = 1; i < ids.length; i += 1) {
      const a = ids[0];
      const b = ids[i];
      if (a !== undefined && b !== undefined) edges.push({ a, b });
    }
  }
  return edges;
}

export interface CandidateGroup<M extends string> {
  memberIds: M[];
  // best vector score inside the group, 0 for entity-only groups
  score: number;
}

/**
 * Union-find over the candidate edges only. Components larger than one Jev
 * group are split in breadth-first order so neighbours stay together.
 * Ordered by best vector score, then size, then id.
 */
export function buildCandidateGroups<M extends string>(
  edges: readonly CandidateEdge<M>[],
): CandidateGroup<M>[] {
  const uf = new UnionFind<M>();
  const adjacent = new Map<M, Set<M>>();
  const link = (from: M, to: M) => {
    const set = adjacent.get(from) ?? new Set<M>();
    set.add(to);
    adjacent.set(from, set);
  };
  for (const edge of edges) {
    if (edge.a === edge.b) continue;
    uf.union(edge.a, edge.b);
    link(edge.a, edge.b);
    link(edge.b, edge.a);
  }
  const components = new Map<M, M[]>();
  for (const id of [...adjacent.keys()].sort()) {
    const root = uf.find(id);
    const members = components.get(root);
    if (members) members.push(id);
    else components.set(root, [id]);
  }

  const chunks: M[][] = [];
  for (const members of components.values()) {
    const order: M[] = [];
    const seen = new Set<M>();
    for (const start of members) {
      if (seen.has(start)) continue;
      const queue = [start];
      seen.add(start);
      while (queue.length > 0) {
        const id = queue.shift();
        if (id === undefined) break;
        order.push(id);
        for (const next of [...(adjacent.get(id) ?? [])].sort()) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (let i = 0; i < order.length; i += AI_GROUP_MAX_MEMBERS) {
      const chunk = order.slice(i, i + AI_GROUP_MAX_MEMBERS);
      if (chunk.length > 1) chunks.push(chunk);
    }
  }

  const groups = chunks.map((memberIds) => {
    const inGroup = new Set(memberIds);
    const score = edges.reduce(
      (best, edge) =>
        edge.score !== undefined && inGroup.has(edge.a) && inGroup.has(edge.b)
          ? Math.max(best, edge.score)
          : best,
      0,
    );
    return { memberIds, score };
  });
  return groups.sort(
    (a, b) =>
      b.score - a.score ||
      b.memberIds.length - a.memberIds.length ||
      String(a.memberIds[0]).localeCompare(String(b.memberIds[0])),
  );
}

/**
 * The groups to judge under a call cap: the top ones, or with `spread` an
 * even stride over the whole list (a first small run sees a fair sample).
 */
export function pickCandidateGroups<G>(
  groups: readonly G[],
  max: number,
  spread: boolean,
): G[] {
  if (groups.length <= max || !spread) return groups.slice(0, max);
  const stride = groups.length / max;
  const picked: G[] = [];
  for (let i = 0; i < max; i += 1) {
    const group = groups[Math.floor(i * stride)];
    if (group !== undefined) picked.push(group);
  }
  return picked;
}

// the same for any member order
function memberSetKey(memberIds: readonly string[]): string {
  return [...memberIds].sort().join(",");
}

/**
 * Splits this scan's candidate groups into the ones an earlier plan already
 * judged (same member set, verdict flagged or not_duplicate) and the ones Jev
 * still has to judge. Errors and unjudged groups go back in the queue. Both
 * lists keep candidate order.
 */
export function reusePriorVerdicts<
  G extends { memberIds: readonly string[] },
  V extends { memberIds: readonly string[]; aiStatus?: string },
>(
  groups: readonly G[],
  verdicts: readonly V[],
): { reused: { group: G; verdict: V }[]; unjudged: G[] } {
  const byKey = new Map<string, V>();
  for (const verdict of verdicts) {
    if (
      verdict.aiStatus === "flagged" ||
      verdict.aiStatus === "not_duplicate"
    ) {
      byKey.set(memberSetKey(verdict.memberIds), verdict);
    }
  }
  const reused: { group: G; verdict: V }[] = [];
  const unjudged: G[] = [];
  for (const group of groups) {
    const verdict = byKey.get(memberSetKey(group.memberIds));
    if (verdict === undefined) unjudged.push(group);
    else reused.push({ group, verdict });
  }
  return { reused, unjudged };
}
