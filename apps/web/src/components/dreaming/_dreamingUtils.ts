import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";

export type DreamRun = FunctionReturnType<typeof api.dream.listRuns>[number];
export type DreamAction = FunctionReturnType<
  typeof api.dream.listActions
>["page"][number];
type DreamSampleGroup = NonNullable<DreamRun["sample"]>[number];
type DreamCounts = DreamRun["counts"];

const TRIGGER_LABELS: Record<DreamRun["trigger"], string> = {
  nightly: "Nightly",
  manual: "Manual",
  backfill: "Cleanup",
};

export function dreamTriggerLabel(trigger: DreamRun["trigger"]): string {
  return TRIGGER_LABELS[trigger];
}

const ACTION_KINDS: readonly DreamAction["kind"][] = [
  "merge",
  "supersede",
  "archive",
  "expire",
];

const ACTION_KIND_LABELS: Record<DreamAction["kind"], string> = {
  merge: "Merged",
  supersede: "Superseded",
  archive: "Archived",
  expire: "Expired",
};

export function dreamActionKindLabel(kind: DreamAction["kind"]): string {
  return ACTION_KIND_LABELS[kind];
}

// counts shown on a run row, in this order; zero counts are left out
const COUNT_LABELS: readonly [keyof DreamCounts, string][] = [
  ["exactMerged", "exact merged"],
  ["keyMerged", "same page merged"],
  ["nearDupMerged", "AI merged"],
  ["superseded", "superseded"],
  ["proposals", "to inbox"],
  ["expired", "expired"],
  ["archived", "archived"],
  ["aiFlagged", "AI flagged"],
];

export function dreamRunCountParts(
  run: Pick<DreamRun, "dryRun" | "cleanup" | "counts" | "sample">,
): string[] {
  if (run.dryRun && run.cleanup) {
    const tagGroups = (run.sample ?? []).filter(
      (group) => group.rule === "tag",
    ).length;
    return [
      ...(run.cleanup.groups > 0
        ? [
            `${plural(run.cleanup.rowsToSuppress, "duplicate row")} in ${plural(run.cleanup.groups, "group")}`,
          ]
        : []),
      ...(tagGroups > 0 ? [plural(tagGroups, "duplicate tag group")] : []),
      ...(run.counts.aiFlagged > 0
        ? [`${String(run.counts.aiFlagged)} AI flagged`]
        : []),
    ];
  }
  return COUNT_LABELS.flatMap(([key, label]) => {
    const n = run.counts[key];
    return n !== undefined && n > 0 ? [`${String(n)} ${label}`] : [];
  });
}

export function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

// actions of one run grouped by kind, fixed kind order, empty kinds dropped
export function groupDreamActionsByKind<
  A extends { kind: DreamAction["kind"] },
>(actions: readonly A[]): { kind: DreamAction["kind"]; actions: A[] }[] {
  return ACTION_KINDS.flatMap((kind) => {
    const ofKind = actions.filter((action) => action.kind === kind);
    return ofKind.length > 0 ? [{ kind, actions: ofKind }] : [];
  });
}

export function canUndoDreamAction(
  action: Pick<DreamAction, "undoneAt" | "undoExpiresAt">,
  nowMs: number,
): boolean {
  return action.undoneAt === undefined && nowMs <= action.undoExpiresAt;
}

// what the card reads from a run (tests pass plain ids)
type CleanupRun<Id extends string> = Pick<
  DreamRun,
  "dryRun" | "status" | "sample" | "cleanup" | "counts"
> & { _id: Id };

export type CleanupCardState<Id extends string = DreamRun["_id"]> =
  | { kind: "none" }
  | { kind: "scanning" }
  | {
      kind: "pending";
      runId: Id;
      rows: number;
      groups: number;
      deterministic: DreamSampleGroup[];
      tags: DreamSampleGroup[];
      // the sample shows at most 50 AI groups; aiFlagged counts them all
      ai: DreamSampleGroup[];
      aiFlagged: number;
      stopNote: string | null;
    }
  | { kind: "applying" };

/**
 * The cleanup card reads the profile's latest one-off cleanup run. A finished
 * dry run is a plan not yet applied (apply inserts a newer run). Nothing to
 * show once applied, failed, or when the scan found nothing.
 */
export function cleanupCardState<Id extends string>(
  run: CleanupRun<Id> | null,
): CleanupCardState<Id> {
  if (run === null) return { kind: "none" };
  if (run.status === "running") {
    return run.dryRun ? { kind: "scanning" } : { kind: "applying" };
  }
  if (!run.dryRun || run.status === "failed") return { kind: "none" };
  const sample = run.sample ?? [];
  const ai = sample.filter((group) => group.rule === "near_dup");
  const tags = sample.filter((group) => group.rule === "tag");
  const groups = run.cleanup?.groups ?? 0;
  const aiFlagged = run.counts.aiFlagged;
  if (groups === 0 && aiFlagged === 0 && tags.length === 0) {
    return { kind: "none" };
  }
  return {
    kind: "pending",
    runId: run._id,
    rows: run.cleanup?.rowsToSuppress ?? 0,
    groups,
    deterministic: sample.filter(
      (group) => group.rule !== "near_dup" && group.rule !== "tag",
    ),
    tags,
    ai,
    aiFlagged,
    stopNote: cleanupStopNote(run),
  };
}

/**
 * Why a finished dry run left candidate groups unchecked: the AI call limit
 * per scan or today's AI budget. The next scan continues with them.
 */
export function cleanupStopNote(
  run: Pick<DreamRun, "status" | "cleanup">,
): string | null {
  const cleanup = run.cleanup;
  if (run.status === "running" || cleanup === undefined) return null;
  if (cleanup.aiSkipped === 0) return null;
  const checked = `${(cleanup.aiCandidates - cleanup.aiSkipped).toLocaleString()} of ${plural(cleanup.aiCandidates, "possible duplicate group")}`;
  return cleanup.aiStopReason === "budget"
    ? `The AI reached its daily limit after it checked ${checked}. Scan again tomorrow to check the rest.`
    : `The AI checked ${checked}. Scan again later to check the rest.`;
}

// Must match WEB_DRY_RUN_GAP_MS in packages/backend/convex/dreamCleanup.ts
export const WEB_DRY_RUN_GAP_MS = 60 * 60 * 1000;

export function scanCooldownUntil(
  startedAt: number,
  nowMs: number,
): number | null {
  const nextAllowedAt = startedAt + WEB_DRY_RUN_GAP_MS;
  return nowMs < nextAllowedAt ? nextAllowedAt : null;
}

export function formatScanAgainAt(untilMs: number): string {
  return new Date(untilMs).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
