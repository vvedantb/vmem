"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { Button, cn } from "@vmem/ui";
import {
  IconAlertCircle,
  IconMoodEmpty,
  IconRefresh,
} from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import { api } from "@vmem/backend";
import MemoryDetailPanel from "./MemoryDetailPanel";
import ListItemRow from "./_components/ListItemRow";
import ListItemPreviewPanel from "./_components/ListItemPreviewPanel";
import AnimatedSearchIcon from "./_components/AnimatedSearchIcon";
import { VmemSpinner } from "@/components/svg-animations";
import { memoryFromApi, type Memory } from "@/lib/memories";
import type { ListItem } from "@/lib/list-items";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";
import type { TrailEntry } from "@/hooks/useTrailData";
import {
  useMemoryListEntries,
  type MemoryListEntry,
} from "@/hooks/useMemoryListEntries";
import { useMemoriesSearchParams } from "@/routes/_main/$profileId/memories/useMemoriesSearchParams";

interface MemoryListVirtuosoContext {
  selectedItemId: string | null;
  trailMap: Map<string, TrailEntry>;
  isDark: boolean;
  onMemoryClick: (memory: Memory) => void;
  onItemSelect: (item: ListItem) => void;
  onContextEdit: (memory: Memory) => void;
  onContextDelete: (memory: Memory) => void;
}

function MemoryListVirtuosoRow({
  entry,
  context,
}: {
  entry: MemoryListEntry;
  context?: MemoryListVirtuosoContext;
}) {
  if (!context) return null;
  return (
    <div className="pb-1.5">
      <ListItemRow
        item={entry.item}
        relevanceScore={entry.score}
        trace={entry.trace}
        isSelected={context.selectedItemId === entry.item.id}
        trailEntry={context.trailMap.get(entry.item.id)}
        isDark={context.isDark}
        onMemoryClick={context.onMemoryClick}
        onItemSelect={context.onItemSelect}
        onContextEdit={context.onContextEdit}
        onContextDelete={context.onContextDelete}
      />
    </div>
  );
}

function renderMemoryListVirtuosoRow(
  _index: number,
  entry: MemoryListEntry,
  context?: MemoryListVirtuosoContext,
) {
  return <MemoryListVirtuosoRow entry={entry} context={context} />;
}

function MemoryListStatus({
  variant,
  onRetry,
}: {
  variant: "loading" | "error" | "empty" | "no-results";
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
          Add a memory, wiki doc, or skill to get started
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

function MemoryListSidePanel({
  previewItem,
  selectedMemory,
  memoryId,
  isPanelLoading,
  panelAction,
  onClosePreview,
  onCloseMemory,
  onMemoryUpdate,
  onMemoryDelete,
  onSelectRelated,
  onConsumeAction,
}: {
  previewItem: ListItem | null;
  selectedMemory: Memory | null;
  memoryId: string | null;
  isPanelLoading: boolean;
  panelAction: "edit" | "delete" | null;
  onClosePreview: () => void;
  onCloseMemory: () => void;
  onMemoryUpdate: (updated: Memory) => void;
  onMemoryDelete: (deletedId: string) => void;
  onSelectRelated: (memory: Memory) => void;
  onConsumeAction: () => void;
}) {
  if (previewItem) {
    return (
      <ListItemPreviewPanel
        key={previewItem.id}
        item={previewItem}
        onClose={onClosePreview}
      />
    );
  }

  if (selectedMemory) {
    return (
      <MemoryDetailPanel
        key={memoryId}
        memory={selectedMemory}
        onClose={onCloseMemory}
        onMemoryUpdate={onMemoryUpdate}
        onMemoryDelete={onMemoryDelete}
        onSelectRelated={onSelectRelated}
        initialAction={panelAction ?? undefined}
        onConsumeAction={onConsumeAction}
      />
    );
  }

  if (!isPanelLoading) return null;

  return (
    <div className="flex h-full items-center justify-center rounded-lg bg-surface-secondary">
      <VmemSpinner size={20} className="text-muted" />
    </div>
  );
}

interface MemorySearchProps {
  memoryId: string | null;
}

// /memories list view — browse + hybrid retrieve, wiki/skills merged in
export default function MemorySearch({ memoryId }: MemorySearchProps) {
  const navigate = useNavigate();
  const [params] = useMemoriesSearchParams();
  const getMemory = useAction(api.memoryApi.getMemory);
  const list = useMemoryListEntries();
  const { theme } = useThemeContext();
  const isDark = theme === "dark";

  const trailTag =
    params.tags.length === 1 ? (params.tags.at(0) ?? null) : null;
  const { trailMap } = useTrailData({ tag: trailTag });

  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );
  const [previewItem, setPreviewItem] = useState<ListItem | null>(null);

  const memoryFromList =
    memoryId === null
      ? null
      : (list.memoryResults.find((memory) => memory.id === memoryId) ?? null);

  const { data: fetchedMemory, isLoading: isFetchingMemory } = useQuery({
    queryKey: ["memory", memoryId],
    enabled: memoryId !== null && memoryFromList === null,
    queryFn: async () => {
      if (memoryId === null) return null;
      return getMemory({ memoryId, profileId: list.activeProfileId });
    },
  });

  const selectedMemory =
    memoryId === null
      ? null
      : (memoryFromList ??
        (fetchedMemory ? memoryFromApi(fetchedMemory) : null));

  // drop stale /$id routes once list + fetch settle empty
  useEffect(() => {
    if (memoryId === null || isFetchingMemory) return;

    if (list.isHybridSearch) {
      if (list.isRetrieveLoading) return;
    } else if (
      list.isBrowseMemoriesLoading ||
      list.isFetchingNextPage ||
      list.hasNextPage
    ) {
      return;
    }

    const inList = list.memoryResults.some((memory) => memory.id === memoryId);
    if (inList || fetchedMemory !== null) return;

    void navigate({
      to: "/$profileId/memories/list",
      params: { profileId: list.activeProfileId },
    });
  }, [
    list.activeProfileId,
    memoryId,
    list.memoryResults,
    fetchedMemory,
    list.isHybridSearch,
    list.isRetrieveLoading,
    list.isBrowseMemoriesLoading,
    list.isFetchingNextPage,
    list.hasNextPage,
    isFetchingMemory,
    navigate,
  ]);

  function openMemory(id: string) {
    setPreviewItem(null);
    void navigate({
      to: "/$profileId/memories/list/$id",
      params: { profileId: list.activeProfileId, id },
    });
  }

  function closeMemory() {
    void navigate({
      to: "/$profileId/memories/list",
      params: { profileId: list.activeProfileId },
    });
  }

  function handleItemSelect(item: ListItem) {
    setPanelAction(null);
    if (previewItem?.id === item.id) {
      setPreviewItem(null);
      return;
    }
    if (memoryId !== null) closeMemory();
    setPreviewItem(item);
  }

  function handleMemoryClick(memory: Memory) {
    setPanelAction(null);
    setPreviewItem(null);
    if (memoryId === memory.id) {
      closeMemory();
      return;
    }
    openMemory(memory.id);
  }

  function handleEndReached() {
    if (list.isHybridSearch) return;
    if (
      !list.hasNextPage ||
      list.isFetchingNextPage ||
      list.isBrowseMemoriesLoading
    ) {
      return;
    }
    void list.fetchNextPage();
  }

  const hasSidePanel = memoryId !== null || previewItem !== null;
  const selectedItemId = memoryId ?? previewItem?.id ?? null;
  const isPanelLoading =
    memoryId !== null &&
    selectedMemory === null &&
    (isFetchingMemory ||
      (list.isHybridSearch
        ? list.isRetrieveLoading
        : list.isBrowseMemoriesLoading || list.isFetchingNextPage));

  if (list.isMemoriesLoading && list.memoryResults.length === 0) {
    return <MemoryListStatus variant="loading" />;
  }

  if (list.isMemoriesError && list.memoryResults.length === 0) {
    return (
      <MemoryListStatus
        variant="error"
        onRetry={() => void list.refetchMemories()}
      />
    );
  }

  if (!list.isShowingSearchResults && list.displayItems.length === 0) {
    return <MemoryListStatus variant="empty" />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {list.isShowingSearchResults && list.displayItems.length === 0 ? (
          <MemoryListStatus variant="no-results" />
        ) : (
          <div
            className={cn(
              "flex min-h-0 flex-1 gap-4",
              hasSidePanel ? "flex-col lg:flex-row" : "",
            )}
          >
            <div
              className={cn(
                "min-h-0 min-w-0",
                hasSidePanel
                  ? "hidden sm:block lg:min-w-0 lg:flex-1"
                  : "flex-1",
              )}
            >
              <Virtuoso
                data={list.displayItems}
                className="scrollbar-thin"
                context={{
                  selectedItemId,
                  trailMap,
                  isDark,
                  onMemoryClick: handleMemoryClick,
                  onItemSelect: handleItemSelect,
                  onContextEdit: (memory) => {
                    openMemory(memory.id);
                    setPanelAction("edit");
                  },
                  onContextDelete: (memory) => {
                    openMemory(memory.id);
                    setPanelAction("delete");
                  },
                }}
                computeItemKey={(_index, entry) => entry.item.id}
                defaultItemHeight={44}
                endReached={handleEndReached}
                itemContent={renderMemoryListVirtuosoRow}
                style={{ height: "100%" }}
              />
            </div>

            {hasSidePanel ? (
              <div className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1">
                <MemoryListSidePanel
                  previewItem={previewItem}
                  selectedMemory={selectedMemory}
                  memoryId={memoryId}
                  isPanelLoading={isPanelLoading}
                  panelAction={panelAction}
                  onClosePreview={() => setPreviewItem(null)}
                  onCloseMemory={closeMemory}
                  onMemoryUpdate={(updated) => {
                    if (memoryId !== updated.id) openMemory(updated.id);
                  }}
                  onMemoryDelete={(deletedId) => {
                    if (memoryId === deletedId) closeMemory();
                  }}
                  onSelectRelated={(memory) => openMemory(memory.id)}
                  onConsumeAction={() => setPanelAction(null)}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
