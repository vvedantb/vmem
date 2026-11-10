import { describe, expect, it } from "vitest";
import {
  canUndoDreamAction,
  cleanupCardState,
  cleanupStopNote,
  dreamRunCountParts,
  formatScanAgainAt,
  scanCooldownUntil,
  WEB_DRY_RUN_GAP_MS,
  groupDreamActionsByKind,
  type DreamAction,
  type DreamRun,
} from "./_dreamingUtils";

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
      run({
        dryRun: true,
        cleanup: CLEANUP,
        sample,
        counts: { ...ZERO_COUNTS, aiFlagged: 1 },
      }),
    );
    expect(state).toMatchObject({
      kind: "pending",
      runId: "run_1",
      rows: 9,
      groups: 2,
      deterministic: [{ keeperTitle: "vhub" }],
      ai: [{ keeperTitle: "Uses pnpm" }],
      aiFlagged: 1,
      stopNote: null,
    });
  });

  it("counts every AI suggestion, not just the sample, and says why a scan stopped", () => {
    const state = cleanupCardState(
      run({
        dryRun: true,
        status: "partial",
        cleanup: {
          ...CLEANUP,
          groups: 0,
          rowsToSuppress: 0,
          aiCandidates: 1_200,
          aiSkipped: 700,
          aiStopReason: "cap",
        },
        sample: sample.slice(1),
        counts: { ...ZERO_COUNTS, aiFlagged: 80 },
      }),
    );
    expect(state).toMatchObject({
      kind: "pending",
      aiFlagged: 80,
      stopNote:
        "The AI checked 500 of 1,200 possible duplicate groups. Scan again later to check the rest.",
    });
  });

  it("keeps a tag-only plan pending", () => {
    const tag: NonNullable<DreamRun["sample"]> = [
      {
        rule: "tag",
        keeperTitle: "youtube",
        loserTitles: ["wwwyoutubecom", "youtubecom"],
        count: 3,
        memoryIds: [],
      },
    ];
    expect(
      cleanupCardState(
        run({
          dryRun: true,
          cleanup: { ...CLEANUP, groups: 0, rowsToSuppress: 0 },
          sample: tag,
        }),
      ),
    ).toMatchObject({
      kind: "pending",
      groups: 0,
      deterministic: [],
      tags: [{ keeperTitle: "youtube" }],
      ai: [],
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

describe("cleanupStopNote", () => {
  const capped = { ...CLEANUP, aiCandidates: 3, aiSkipped: 2 };

  it("is empty when the AI checked every group or is still checking", () => {
    expect(cleanupStopNote(run({ dryRun: true }))).toBeNull();
    expect(cleanupStopNote(run({ dryRun: true, cleanup: CLEANUP }))).toBeNull();
    expect(
      cleanupStopNote(
        run({ dryRun: true, status: "running", cleanup: capped }),
      ),
    ).toBeNull();
  });

  it("names the daily budget when that stopped the scan", () => {
    expect(
      cleanupStopNote(
        run({
          dryRun: true,
          status: "partial",
          cleanup: { ...capped, aiStopReason: "budget" },
        }),
      ),
    ).toBe(
      "The AI reached its daily limit after it checked 1 of 3 possible duplicate groups. Scan again tomorrow to check the rest.",
    );
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
    expect(
      dreamRunCountParts(
        run({
          dryRun: true,
          cleanup: { ...CLEANUP, groups: 0, rowsToSuppress: 0 },
          sample: [
            {
              rule: "tag",
              keeperTitle: "youtube",
              loserTitles: ["youtubecom"],
              count: 2,
              memoryIds: [],
            },
          ],
        }),
      ),
    ).toEqual(["1 duplicate tag group"]);
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

describe("scan cooldown", () => {
  it("returns the next allowed time while cooling down", () => {
    expect(scanCooldownUntil(1_000, 1_000 + WEB_DRY_RUN_GAP_MS - 1)).toBe(
      1_000 + WEB_DRY_RUN_GAP_MS,
    );
  });

  it("returns null once the gap has passed", () => {
    expect(scanCooldownUntil(1_000, 1_000 + WEB_DRY_RUN_GAP_MS)).toBeNull();
  });

  it("formats a local hour and minute", () => {
    const until = Date.parse("2026-10-20T19:58:00");
    expect(formatScanAgainAt(until)).toMatch(/19:58|7:58/);
  });
});
