import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  canUndoDreamAction,
  cleanupCardState,
  dreamRunCountParts,
  groupDreamActionsByKind,
  type DreamAction,
  type DreamRun,
} from "./_dreamingUtils";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(path.join(here, rel), "utf8");
}

const NOW = Date.parse("2026-10-20T03:00:00Z");

const ZERO_COUNTS = {
  exactMerged: 0,
  keyMerged: 0,
  nearDupMerged: 0,
  superseded: 0,
  proposals: 0,
  expired: 0,
  archived: 0,
  aiFlagged: 0,
};

type RunFields = Pick<
  DreamRun,
  "dryRun" | "status" | "sample" | "cleanup" | "counts"
>;

function run(fields: Partial<RunFields> = {}): RunFields & { _id: string } {
  return {
    _id: "run_1",
    dryRun: false,
    status: "ok",
    counts: ZERO_COUNTS,
    ...fields,
  };
}

const CLEANUP = {
  scannedRows: 100,
  exactGroups: 1,
  keyGroups: 1,
  bothGroups: 0,
  groups: 2,
  rowsToSuppress: 9,
  aiCandidates: 1,
  aiNotDuplicate: 0,
  aiErrors: 0,
  aiSkipped: 0,
  aiCostUnknown: 0,
  skippedChanged: 0,
};

describe("cleanupCardState", () => {
  const sample: NonNullable<DreamRun["sample"]> = [
    { rule: "key", keeperTitle: "vhub", count: 8, memoryIds: [] },
    { rule: "near_dup", keeperTitle: "Uses pnpm", count: 2, memoryIds: [] },
  ];

  it("shows a finished dry run as a pending plan, AI groups apart", () => {
    const state = cleanupCardState(
      run({ dryRun: true, cleanup: CLEANUP, sample }),
    );
    expect(state).toMatchObject({
      kind: "pending",
      runId: "run_1",
      rows: 9,
      groups: 2,
      deterministic: [{ keeperTitle: "vhub" }],
      ai: [{ keeperTitle: "Uses pnpm" }],
    });
  });

  it("hides once applied, failed, empty or absent", () => {
    expect(cleanupCardState(null).kind).toBe("none");
    expect(cleanupCardState(run()).kind).toBe("none");
    expect(cleanupCardState(run({ dryRun: true, status: "failed" })).kind).toBe(
      "none",
    );
    expect(
      cleanupCardState(
        run({
          dryRun: true,
          cleanup: { ...CLEANUP, groups: 0, rowsToSuppress: 0 },
        }),
      ).kind,
    ).toBe("none");
  });

  it("reports scanning and applying while a run is open", () => {
    expect(
      cleanupCardState(run({ dryRun: true, status: "running" })).kind,
    ).toBe("scanning");
    expect(cleanupCardState(run({ status: "running" })).kind).toBe("applying");
  });
});

describe("dream run rows", () => {
  it("lists non-zero counts, or the plan size for a dry run", () => {
    expect(
      dreamRunCountParts(
        run({ counts: { ...ZERO_COUNTS, exactMerged: 2, archived: 1 } }),
      ),
    ).toEqual(["2 exact merged", "1 archived"]);
    expect(
      dreamRunCountParts(
        run({
          dryRun: true,
          cleanup: CLEANUP,
          counts: { ...ZERO_COUNTS, aiFlagged: 1 },
        }),
      ),
    ).toEqual(["9 duplicate rows in 2 groups", "1 AI flagged"]);
  });

  it("groups actions by kind in a fixed order", () => {
    const actions: { id: string; kind: DreamAction["kind"] }[] = [
      { id: "a1", kind: "archive" },
      { id: "a2", kind: "merge" },
      { id: "a3", kind: "archive" },
    ];
    const groups = groupDreamActionsByKind(actions);
    expect(groups.map((g) => [g.kind, g.actions.map((a) => a.id)])).toEqual([
      ["merge", ["a2"]],
      ["archive", ["a1", "a3"]],
    ]);
  });

  it("allows undo only inside the window and once", () => {
    const open = { undoExpiresAt: NOW + 1000 };
    expect(canUndoDreamAction(open, NOW)).toBe(true);
    expect(canUndoDreamAction(open, NOW + 2000)).toBe(false);
    expect(canUndoDreamAction({ ...open, undoneAt: NOW }, NOW)).toBe(false);
  });
});

describe("dreaming surfaces", () => {
  it("serves /dreaming in the shared page container", () => {
    const route = read("../../routes/_main/$profileId/dreaming.tsx");
    expect(route).toContain('createFileRoute("/_main/$profileId/dreaming")');
    expect(route).toContain("PageContainer");
    expect(route).toContain("DreamingPanel");
  });

  it("confirms before applying the cleanup and uses the auth-checked wrapper", () => {
    const card = read("DreamCleanupCard.tsx");
    expect(card).toContain("api.dreamCleanup.applyCleanup");
    expect(card).toContain("ConfirmDialog.Root");
    expect(card).toContain("AI suggests — needs your approval");
    expect(read("../dashboard/Dashboard.tsx")).toContain(
      "<DreamCleanupCard />",
    );
  });

  it("reads the last dream run once per list, not per row", () => {
    const row = read("../_components/ListItemRow.tsx");
    expect(row).not.toContain("useQuery");
    expect(row).not.toContain("lastDreamRunAt");
    expect(read("../_components/MemoryVirtuosoList.tsx")).toContain(
      "api.dream.lastSuccessfulRunAt",
    );
  });
});
