import type { MemoryStatus } from "@vmem/sdk";
import { normalizeTags } from "../tags";

export type DreamSuppressedBy = "dream" | "dream-decay" | "dream-ai";

export const DREAM_UNDO_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_MERGED_SOURCES = 10;

// the memory fields a dream action may change, as stored in dreamActions.before.
// M is the memory id type, R the run id type (Convex ids in the backend).
export interface DreamSnapshot<M extends string, R extends string> {
  memoryId: M;
  status: MemoryStatus;
  mergedInto?: M;
  suppressedBy?: DreamSuppressedBy;
  suppressedRunId?: R;
  visitCount: number;
  firstVisitAt: number;
  lastVisitAt: number;
  tags: string[];
  sources?: string[];
  url?: string;
  sourceId?: string;
}

export interface MergeRow<M extends string, R extends string> extends Omit<
  DreamSnapshot<M, R>,
  "memoryId"
> {
  _id: M;
  createdAt: number;
  content: string;
  source: string;
}

export function snapshotRow<M extends string, R extends string>(
  row: MergeRow<M, R>,
): DreamSnapshot<M, R> {
  return {
    memoryId: row._id,
    status: row.status,
    mergedInto: row.mergedInto,
    suppressedBy: row.suppressedBy,
    suppressedRunId: row.suppressedRunId,
    visitCount: row.visitCount,
    firstVisitAt: row.firstVisitAt,
    lastVisitAt: row.lastVisitAt,
    tags: row.tags,
    sources: row.sources,
    url: row.url,
    sourceId: row.sourceId,
  };
}

// Every key is listed: a stored snapshot drops undefined fields, and a patch
// only clears a field when the key is present with undefined.
export function restorePatch<M extends string, R extends string>(
  snapshot: DreamSnapshot<M, R>,
): Omit<DreamSnapshot<M, R>, "memoryId"> {
  return {
    status: snapshot.status,
    mergedInto: snapshot.mergedInto,
    suppressedBy: snapshot.suppressedBy,
    suppressedRunId: snapshot.suppressedRunId,
    visitCount: snapshot.visitCount,
    firstVisitAt: snapshot.firstVisitAt,
    lastVisitAt: snapshot.lastVisitAt,
    tags: snapshot.tags,
    sources: snapshot.sources,
    url: snapshot.url,
    sourceId: snapshot.sourceId,
  };
}

// the fields keeper choice reads
interface KeeperCandidate {
  _id: string;
  status: MemoryStatus;
  createdAt: number;
  content: string;
}

// oldest first (it keeps the id agents and links point at), then longest
// content, then id so the choice is stable
function keeperOrder(a: KeeperCandidate, b: KeeperCandidate): number {
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
  if (a.content.length !== b.content.length) {
    return b.content.length - a.content.length;
  }
  return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
}

/**
 * Keeper for a deterministic merge: the pinned row, else the oldest. A pinned
 * row is never suppressed, so a group with two pinned rows is skipped (null).
 */
export function chooseKeeper<Row extends KeeperCandidate>(
  rows: readonly Row[],
): Row | null {
  const pinned = rows.filter((row) => row.status === "pinned");
  if (pinned.length > 1) return null;
  if (pinned[0] !== undefined) return pinned[0];
  return [...rows].sort(keeperOrder)[0] ?? null;
}

/**
 * Applies the pinned rule to a caller-chosen keeper: a pinned loser becomes
 * the keeper and the old keeper a loser. Null when two rows are pinned.
 */
export function resolvePinnedKeeper<Row extends KeeperCandidate>(
  keeper: Row,
  losers: readonly Row[],
): { keeper: Row; losers: Row[] } | null {
  const rows = [keeper, ...losers];
  const pinned = rows.filter((row) => row.status === "pinned");
  if (pinned.length > 1) return null;
  const next = pinned[0] ?? keeper;
  return { keeper: next, losers: rows.filter((row) => row !== next) };
}

function rowSources<M extends string, R extends string>(
  row: MergeRow<M, R>,
): string[] {
  return row.sources ?? [row.source];
}

/**
 * Keeper fields after a merge: visits summed, first/last visit widened, tags
 * and sources joined (sources capped at 10), url from the most recently
 * visited row, sourceId set to `sourceKey` when given.
 */
export function mergeKeeperPatch<M extends string, R extends string>(
  keeper: MergeRow<M, R>,
  losers: readonly MergeRow<M, R>[],
  sourceKey?: string,
): Pick<
  DreamSnapshot<M, R>,
  | "visitCount"
  | "firstVisitAt"
  | "lastVisitAt"
  | "tags"
  | "sources"
  | "url"
  | "sourceId"
> {
  const rows = [keeper, ...losers];
  const sources = [...new Set(rows.flatMap(rowSources))].slice(
    0,
    MAX_MERGED_SOURCES,
  );
  const withUrl = rows.filter((row) => row.url !== undefined);
  const recent = withUrl.reduce<MergeRow<M, R> | undefined>(
    (best, row) =>
      best === undefined || row.lastVisitAt > best.lastVisitAt ? row : best,
    undefined,
  );
  return {
    visitCount: rows.reduce((sum, row) => sum + row.visitCount, 0),
    firstVisitAt: Math.min(...rows.map((row) => row.firstVisitAt)),
    lastVisitAt: Math.max(...rows.map((row) => row.lastVisitAt)),
    tags: normalizeTags(rows.flatMap((row) => row.tags)),
    sources,
    url: recent?.url,
    sourceId: sourceKey ?? keeper.sourceId,
  };
}

export function mergeLoserPatch<M extends string, R extends string>(
  keeperId: M,
  runId: R,
  suppressedBy: DreamSuppressedBy,
): Pick<
  DreamSnapshot<M, R>,
  "status" | "mergedInto" | "suppressedBy" | "suppressedRunId"
> {
  return {
    status: "suppressed",
    mergedInto: keeperId,
    suppressedBy,
    suppressedRunId: runId,
  };
}
