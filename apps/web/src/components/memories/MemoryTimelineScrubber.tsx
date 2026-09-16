import { formatDate, formatDateTime } from "@vmem/shared";
import { Button, Input, cn } from "@vmem/ui";
import {
  TIMELINE_DENSITY_BUCKETS,
  TIMELINE_SCRUBBER_STEPS,
  TIMELINE_SPAN_LABELS,
  TIMELINE_SPANS,
  densityBuckets,
  playheadFromProgress,
  progressFromPlayhead,
  type MemoryTimelineRange,
  type TimelineSpan,
} from "@/lib/memory-timeline-view";

interface MemoryTimelineScrubberProps {
  range: MemoryTimelineRange;
  window: MemoryTimelineRange;
  playheadMs: number;
  createdAts: readonly string[];
  span: TimelineSpan;
  onPlayheadChange: (playheadMs: number) => void;
  onSpanChange: (span: TimelineSpan) => void;
  countLabel: string;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(3)}%`;
}

export default function MemoryTimelineScrubber({
  range,
  window,
  playheadMs,
  createdAts,
  span,
  onPlayheadChange,
  onSpanChange,
  countLabel,
}: MemoryTimelineScrubberProps) {
  const buckets = densityBuckets(createdAts, range, TIMELINE_DENSITY_BUCKETS);
  const maxCount = buckets.reduce((max, count) => Math.max(max, count), 1);
  const rangeMs = range.endMs - range.startMs;
  const windowLeft =
    rangeMs <= 0 ? 0 : (window.startMs - range.startMs) / rangeMs;
  const windowWidth =
    rangeMs <= 0 ? 1 : (window.endMs - window.startMs) / rangeMs;
  const progress = progressFromPlayhead(playheadMs, range);
  const sliderValue = Math.round(progress * TIMELINE_SCRUBBER_STEPS);
  const playheadLabel = formatDateTime(playheadMs);

  return (
    <div
      data-testid="memory-timeline-scrubber"
      className="shrink-0 rounded-lg bg-surface-secondary px-3 py-3 sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground" aria-live="polite">
            {playheadLabel}
          </p>
          <p className="text-xs text-muted">{countLabel}</p>
        </div>
        <div
          className="flex min-w-0 max-sm:max-w-full max-sm:overflow-x-auto max-sm:scrollbar-none"
          role="group"
          aria-label="Time window size"
        >
          <div className="flex gap-0.5 rounded-full bg-segment p-0.5">
            {TIMELINE_SPANS.map((value) => {
              const active = value === span;
              return (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={active ? "secondary" : "ghost"}
                  aria-pressed={active}
                  onClick={() => onSpanChange(value)}
                  className={cn(
                    "h-8 shrink-0 rounded-full px-2.5",
                    active ? "text-foreground" : "text-muted",
                  )}
                >
                  {TIMELINE_SPAN_LABELS[value]}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative mt-3 pt-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 flex h-8 items-end gap-px"
          aria-hidden="true"
        >
          {buckets.map((count, index) => (
            <div
              key={index}
              className="min-w-0 flex-1 rounded-t-sm bg-accent"
              style={{
                height: `${Math.max(10, (count / maxCount) * 100)}%`,
                opacity: count === 0 ? 0.18 : 0.72,
              }}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute bottom-3 top-1 rounded-sm bg-accent/20 ring-1 ring-accent/25"
          style={{
            left: percent(windowLeft),
            width: percent(Math.max(windowWidth, 0.012)),
          }}
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute inset-x-0 bottom-[0.85rem] h-2 rounded-full bg-foreground/20"
          aria-hidden="true"
        />

        <Input
          type="range"
          min={0}
          max={TIMELINE_SCRUBBER_STEPS}
          step={1}
          value={sliderValue}
          aria-label="Scrub through memory time"
          aria-valuemin={0}
          aria-valuemax={TIMELINE_SCRUBBER_STEPS}
          aria-valuenow={sliderValue}
          aria-valuetext={playheadLabel}
          className="timeline-scrubber relative z-[1] mt-0 h-11 w-full cursor-pointer border-0 bg-transparent px-0 py-0 shadow-none hover:bg-transparent focus-visible:border-0 focus-visible:bg-transparent focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onChange={(event) => {
            const next = Number(event.target.value);
            onPlayheadChange(
              playheadFromProgress(next / TIMELINE_SCRUBBER_STEPS, range),
            );
          }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted tabular-nums sm:text-xs">
        <span>{formatDate(range.startMs)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted hover:text-foreground"
          onClick={() => onPlayheadChange(Number.POSITIVE_INFINITY)}
        >
          Jump to now
        </Button>
        <span>Now</span>
      </div>
    </div>
  );
}
