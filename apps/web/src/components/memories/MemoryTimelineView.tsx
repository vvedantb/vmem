import { useMemo, useState } from "react";
import { Button, cn } from "@vmem/ui";
import {
  IconAlertCircle,
  IconMoodEmpty,
  IconRefresh,
} from "@tabler/icons-react";
import MemoryDetailPanel from "./MemoryDetailPanel";
import MemoryTimelineScrubber from "./MemoryTimelineScrubber";
import ListItemPreviewPanel from "@/components/_components/ListItemPreviewPanel";
import { MemoryVirtuosoList } from "@/components/_components/MemoryVirtuosoList";
import AnimatedSearchIcon from "@/components/_components/AnimatedSearchIcon";
import { VmemSpinner } from "@/components/icons/animations";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useMemoryListEntries } from "@/hooks/useMemoryListEntries";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import { useTrailData } from "@/hooks/useTrailData";
import {
  itemCreatedInWindow,
  memoryTimelineRange,
  resolvedPlayheadMs,
  spanDurationMs,
  windowCountLabel,
  windowForPlayhead,
  type TimelineSpan,
} from "@/lib/memory-timeline-view";
import type { ListItem } from "@/lib/list-items";
import type { Memory } from "@/lib/memories";

function TimelineStatus({
  variant,
  onRetry,
}: {
  variant: "loading" | "error" | "empty" | "no-results" | "no-window";
  onRetry?: () => void;
}) {
  if (variant === "loading") {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <VmemSpinner size={24} className="text-muted" />
      </div>
    );
  }

  if (variant === "error") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
          <IconAlertCircle className="h-6 w-6 text-danger" />
        </div>
        <h3 className="mb-2 text-balance text-lg font-medium text-foreground">
          Failed to load memories
        </h3>
        <p className="mb-4 text-sm text-muted">
          Something went wrong fetching this workspace's memories.
        </p>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <IconRefresh size={16} />
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  if (variant === "empty") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-secondary">
          <IconMoodEmpty className="h-6 w-6 text-muted" />
        </div>
        <h3 className="mb-2 text-balance text-lg font-medium text-foreground">
          Nothing here yet
        </h3>
        <p className="text-sm text-muted">
          Add a memory to start a timeline through time
        </p>
      </div>
    );
  }

  if (variant === "no-window") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary">
          <AnimatedSearchIcon className="text-muted" />
        </div>
        <h3 className="mb-1 text-balance text-base font-medium text-foreground">
          No memories in this window
        </h3>
        <p className="text-sm text-muted">
          Scrub the timeline or widen the window to browse another stretch of
          time
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary">
        <AnimatedSearchIcon className="text-muted" />
      </div>
      <h3 className="mb-1 text-balance text-base font-medium text-foreground">
        No results found
      </h3>
      <p className="text-sm text-muted">
        Try searching with different keywords
      </p>
    </div>
  );
}

export default function MemoryTimelineView() {
  const [params] = useMemoriesSearchParams();
  const filterKey = [
    params.q,
    params.tags.join("\0"),
    params.types.join("\0"),
    params.sources.join("\0"),
    params.kinds.join("\0"),
  ].join("|");
  return <MemoryTimelineBody key={filterKey} />;
}

function MemoryTimelineBody() {
  const [params, setParams] = useMemoriesSearchParams();
  const list = useMemoryListEntries({ fetchAll: true });
  const { isDark } = useThemeContext();
  const trailTag =
    params.tags.length === 1 ? (params.tags.at(0) ?? null) : null;
  const trailMap = useTrailData({ tag: trailTag });

  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [previewItem, setPreviewItem] = useState<ListItem | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  const createdAts = useMemo(
    () => list.displayItems.map((entry) => entry.item.createdAt),
    [list.displayItems],
  );
  const range = useMemo(
    () => memoryTimelineRange(createdAts, Date.now()),
    [createdAts],
  );

  const span: TimelineSpan = params.span;
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

  const windowEntries = useMemo(() => {
    if (window === null) return [];
    return list.displayItems
      .filter((entry) => itemCreatedInWindow(entry.item.createdAt, window))
      .sort(
        (a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt),
      );
  }, [list.displayItems, window]);

  const memoryCount = windowEntries.filter(
    (entry) => entry.item.kind === "memory",
  ).length;

  function openMemory(memory: Memory) {
    setPreviewItem(null);
    setSelectedMemory(memory);
  }

  function closeMemory() {
    setSelectedMemory(null);
    setPanelAction(null);
  }

  const hasSidePanel = selectedMemory !== null || previewItem !== null;
  const selectedItemId = selectedMemory?.id ?? previewItem?.id ?? null;

  if (list.isMemoriesLoading && list.displayItems.length === 0) {
    return <TimelineStatus variant="loading" />;
  }

  if (list.isMemoriesError && list.displayItems.length === 0) {
    return (
      <TimelineStatus
        variant="error"
        onRetry={() => void list.refetchMemories()}
      />
    );
  }

  if (!list.isShowingSearchResults && list.displayItems.length === 0) {
    return <TimelineStatus variant="empty" />;
  }

  if (list.isShowingSearchResults && list.displayItems.length === 0) {
    return <TimelineStatus variant="no-results" />;
  }

  if (range === null || resolvedPlayhead === null || window === null) {
    return <TimelineStatus variant="empty" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MemoryTimelineScrubber
        range={range}
        window={window}
        playheadMs={resolvedPlayhead}
        createdAts={createdAts}
        span={span}
        onPlayheadChange={setPlayheadMs}
        onSpanChange={(next) => setParams({ span: next })}
        countLabel={windowCountLabel(windowEntries.length, memoryCount)}
      />

      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 gap-4",
          hasSidePanel ? "flex-col lg:flex-row" : "",
        )}
      >
        <div
          className={cn(
            "min-h-0 min-w-0",
            hasSidePanel ? "hidden sm:block lg:min-w-0 lg:flex-1" : "flex-1",
          )}
        >
          {windowEntries.length === 0 ? (
            <TimelineStatus variant="no-window" />
          ) : (
            <MemoryVirtuosoList
              entries={windowEntries}
              selectedItemId={selectedItemId}
              trailMap={trailMap}
              isDark={isDark}
              handlers={{
                onMemoryClick: (memory) => {
                  setPanelAction(null);
                  if (selectedMemory?.id === memory.id) {
                    closeMemory();
                    return;
                  }
                  openMemory(memory);
                },
                onItemSelect: (item) => {
                  setPanelAction(null);
                  closeMemory();
                  setPreviewItem((current) =>
                    current?.id === item.id ? null : item,
                  );
                },
                onContextEdit: (memory) => {
                  openMemory(memory);
                  setPanelAction("edit");
                },
                onContextDelete: (memory) => {
                  openMemory(memory);
                  setPanelAction("delete");
                },
              }}
            />
          )}
        </div>

        {hasSidePanel ? (
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1">
            {previewItem ? (
              <ListItemPreviewPanel
                key={previewItem.id}
                item={previewItem}
                onClose={() => setPreviewItem(null)}
              />
            ) : selectedMemory ? (
              <MemoryDetailPanel
                key={selectedMemory.id}
                memory={selectedMemory}
                onClose={closeMemory}
                onMemoryDelete={(deletedId) => {
                  if (selectedMemory.id === deletedId) closeMemory();
                }}
                onSelectRelated={(memory) => openMemory(memory)}
                initialAction={panelAction ?? undefined}
                onConsumeAction={() => setPanelAction(null)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
