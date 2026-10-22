import { useQuery } from "convex/react";
import { useQueryStates } from "nuqs";
import { Link } from "@tanstack/react-router";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { Button, Input, Skeleton, cn } from "@vvedantb/ui";
import { api } from "@vmem/backend";
import type { Doc } from "@vmem/backend";
import { parseDayKey, ROLLUP_PERIODS, utcDayKey } from "@vmem/shared";
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  memoriesNuqsOptions,
  timelineSummarySearchParams,
} from "@/lib/url-state/memories";
import {
  SUMMARY_PERIOD_LABELS,
  summaryPeriodLabel,
  summaryPeriodView,
} from "@/lib/timeline-summary";

// a day row cites a handful; week and month rows can cite many more
const CITED_MEMORY_LIMIT = 12;

function rollupStatsLabel(stats: Doc<"rollups">["stats"]): string {
  return [
    `${stats.created} created`,
    `${stats.updated} updated`,
    `${stats.toolCalls} tool calls`,
  ].join(" · ");
}

function RollupSummary({
  rollup,
  profileId,
}: {
  rollup: Doc<"rollups">;
  profileId: string;
}) {
  const cited = rollup.memoryIds.slice(0, CITED_MEMORY_LIMIT);
  const moreCount = rollup.memoryIds.length - cited.length;
  return (
    <div className="mt-3 grid gap-3">
      <p className="text-pretty text-sm leading-relaxed text-foreground">
        {rollup.summary}
      </p>
      {rollup.highlights.length > 0 ? (
        <ul className="grid list-disc gap-1 pl-5 text-sm text-foreground">
          {rollup.highlights.map((highlight, index) => (
            <li key={index}>{highlight}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted tabular-nums">
        {rollupStatsLabel(rollup.stats)}
      </p>
      {cited.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Cited:</span>
          {cited.map((memoryId) => (
            <Link
              key={memoryId}
              to="/$profileId/memories/list/$id"
              params={{ profileId, id: memoryId }}
              title={memoryId}
              className="max-w-40 truncate rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-muted hover:text-foreground"
            >
              {memoryId}
            </Link>
          ))}
          {moreCount > 0 ? (
            <span className="text-xs text-muted">+{moreCount} more</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RollupEmpty({ rollupsEnabled }: { rollupsEnabled: boolean }) {
  return (
    <div className="mt-3 grid gap-1">
      <p className="text-sm text-muted">No summary for this period yet</p>
      {rollupsEnabled ? null : (
        <p className="text-xs text-muted">
          Daily summaries are off.{" "}
          <Link
            to="/settings/preferences"
            className="text-foreground underline underline-offset-2"
          >
            Turn them on in Preferences
          </Link>
        </p>
      )}
    </div>
  );
}

export default function MemoryTimelineSummaryCard() {
  const profile = useActiveProfile();
  const [{ period, on }, setParams] = useQueryStates(
    timelineSummarySearchParams,
    memoriesNuqsOptions,
  );
  const nowMs = Date.now();
  const view = summaryPeriodView(period, on, nowMs);
  // one period of one kind: at most one row, never the memory list
  const result = useQuery(api.rollups.getRollups, {
    profileId: profile._id,
    period,
    startMs: view.window.startMs,
    endMs: view.window.endMs,
  });
  const rollup = result?.rollups.find((row) => row.periodKey === view.key);
  const isEmpty = result !== undefined && rollup === undefined;
  const settings = useQuery(api.userSettings.get, isEmpty ? {} : "skip");

  return (
    <section
      aria-label="Period summary"
      data-testid="memory-timeline-summary"
      className="shrink-0 rounded-lg bg-surface-secondary px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Previous period"
            className="h-8 w-8 px-0 text-muted"
            onClick={() => void setParams({ on: view.prevDayKey })}
          >
            <IconChevronLeft size={16} />
          </Button>
          <p
            className="min-w-0 truncate text-sm font-medium text-foreground"
            aria-live="polite"
          >
            {summaryPeriodLabel(period, view.window)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Next period"
            className="h-8 w-8 px-0 text-muted"
            disabled={view.nextDayKey === null}
            onClick={() => void setParams({ on: view.nextDayKey })}
          >
            <IconChevronRight size={16} />
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 max-sm:max-w-full max-sm:overflow-x-auto max-sm:scrollbar-none">
          <Input
            type="date"
            aria-label="Jump to date (UTC)"
            value={view.dayKey}
            max={utcDayKey(nowMs)}
            className="h-8 w-auto shrink-0"
            onChange={(event) => {
              const next = event.target.value;
              if (parseDayKey(next) !== null) void setParams({ on: next });
            }}
          />
          <div
            className="flex gap-1.5"
            role="group"
            aria-label="Summary period"
          >
            {ROLLUP_PERIODS.map((value) => {
              const active = value === period;
              return (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  aria-pressed={active}
                  onClick={() => void setParams({ period: value })}
                  className={cn(
                    "h-8 shrink-0 rounded-full border border-border px-2.5",
                    active ? "text-foreground" : "text-muted",
                  )}
                >
                  {SUMMARY_PERIOD_LABELS[value]}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {result === undefined ? (
        <div className="mt-3 grid gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : rollup ? (
        <RollupSummary rollup={rollup} profileId={profile._id} />
      ) : (
        <RollupEmpty rollupsEnabled={settings?.rollupsEnabled ?? true} />
      )}
    </section>
  );
}
