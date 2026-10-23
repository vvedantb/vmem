import {
  formatDate,
  formatDateTime,
  handleNativeRangeKeyDown,
} from "@vmem/shared";
import { Button, Slider, cn } from "@vvedantb/ui";
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

const SCRUBBER_RANGE = { min: 0, max: TIMELINE_SCRUBBER_STEPS, step: 1 };

// Radix renders Track > Range as the first span, then Thumb (role="slider").
// The track stays transparent so the decorative track below shows through.
const SCRUBBER_CLASS = cn(
  "relative z-[1] h-11 cursor-pointer",
  "[&>span:first-child]:h-2 [&>span:first-child]:bg-transparent [&>span:first-child>span]:bg-transparent",
  "[&_[role=slider]]:size-[1.125rem] [&_[role=slider]]:border-2 [&_[role=slider]]:border-surface [&_[role=slider]]:bg-accent",
  "[&_[role=slider]]:shadow-[0_0_0_1px_color-mix(in_oklch,var(--foreground)_22%,transparent)]",
);

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
  const scrubTo = (step: number) =>
    onPlayheadChange(
      playheadFromProgress(step / TIMELINE_SCRUBBER_STEPS, range),
    );

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
          <div className="flex gap-1.5">
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
                    "h-8 shrink-0 rounded-full border border-border px-2.5",
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

        <Slider
          min={SCRUBBER_RANGE.min}
          max={SCRUBBER_RANGE.max}
          step={SCRUBBER_RANGE.step}
          value={[sliderValue]}
          aria-label="Scrub through memory time"
          aria-valuetext={playheadLabel}
          className={SCRUBBER_CLASS}
          onValueChange={(values) => {
            const next = values[0];
            if (next !== undefined) scrubTo(next);
          }}
          onKeyDown={(event) =>
            handleNativeRangeKeyDown(
              event,
              sliderValue,
              SCRUBBER_RANGE,
              scrubTo,
            )
          }
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
