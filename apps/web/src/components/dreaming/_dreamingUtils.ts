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
      ...(tagGroups > 0
        ? [plural(tagGroups, "duplicate tag group")]
        : []),
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
  "dryRun" | "status" | "sample" | "cleanup"
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
      ai: DreamSampleGroup[];
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
  if (groups === 0 && ai.length === 0 && tags.length === 0) {
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
  };
}
