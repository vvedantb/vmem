import { useMemo, useState } from "react";
import { Button, cn } from "@vmem/ui";
import { formatCompactRelativeTime } from "@vmem/shared";
import { MemorySourceIcon } from "@/components/_components/MemorySourceIcon";
import ShapeIndicator from "@/components/_components/ShapeIndicator";
import { formatMemorySourceLabel } from "@/lib/memories";
import MemoryTimelineScrubber from "@/components/memories/MemoryTimelineScrubber";
import {
  itemCreatedInWindow,
  memoryTimelineRange,
  resolvedPlayheadMs,
  spanDurationMs,
  windowCountLabel,
  windowForPlayhead,
  type TimelineSpan,
} from "@/lib/memory-timeline-view";
import { demoMemories, type DemoMemory } from "./landing-preview-data";
import { LANDING_MONO } from "./landingContent";

export function LandingTimelinePreview() {
  const createdAts = useMemo(
    () => demoMemories.map((memory) => memory.createdAt),
    [],
  );
  const range = useMemo(
    () => memoryTimelineRange(createdAts, Date.now()),
    [createdAts],
  );
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [span, setSpan] = useState<TimelineSpan>("week");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const resolvedPlayhead =
    range === null ? null : resolvedPlayheadMs(playheadMs, createdAts, range);
  const window =
    range === null || resolvedPlayhead === null
      ? null
      : windowForPlayhead(
          resolvedPlayhead,
          spanDurationMs(span, range.endMs - range.startMs),
          range,
        );

  const visible = useMemo(() => {
    if (window === null) return demoMemories;
    return demoMemories
      .filter((memory) => itemCreatedInWindow(memory.createdAt, window))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [window]);

  if (range === null || resolvedPlayhead === null || window === null) {
    return null;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 pb-3 pt-1 md:px-4">
      <MemoryTimelineScrubber
        range={range}
        window={window}
        playheadMs={resolvedPlayhead}
        createdAts={createdAts}
        span={span}
        onPlayheadChange={setPlayheadMs}
        onSpanChange={setSpan}
        countLabel={windowCountLabel(visible.length, visible.length)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col gap-0.5">
          {visible.map((memory) => (
            <TimelineRow
              key={memory.id}
              memory={memory}
              isSelected={memory.id === selectedId}
              onSelect={() =>
                setSelectedId((current) =>
                  current === memory.id ? null : memory.id,
                )
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  memory,
  isSelected,
  onSelect,
}: {
  memory: DemoMemory;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const color = LANDING_MONO.mid;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onSelect}
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-lg px-3 py-2.5 text-left",
        isSelected && "bg-surface-secondary",
      )}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted"
        aria-label={formatMemorySourceLabel(memory.source)}
      >
        <MemorySourceIcon source={memory.source} size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {memory.title}
      </span>
      <ShapeIndicator kind="memory" color={color} className="h-2.5 w-2.5" />
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {formatCompactRelativeTime(memory.createdAt)}
      </span>
    </Button>
  );
}
