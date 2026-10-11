import { startTransition, useState, useEffect, ViewTransition } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Button, cn } from "@vvedantb/ui";
import {
  IconAlertCircle,
  IconMoodEmpty,
  IconRefresh,
} from "@tabler/icons-react";
import { api } from "@vmem/backend";
import MemoryDetailPanel from "./MemoryDetailPanel";
import ListItemPreviewPanel from "@/components/_components/ListItemPreviewPanel";
import { MemoryVirtuosoList } from "@/components/_components/MemoryVirtuosoList";
import AnimatedSearchIcon from "@/components/_components/AnimatedSearchIcon";
import { VmemSpinner } from "@/components/icons/animations";
import { memoryFromApi, type Memory } from "@/lib/memories";
import { useMemoryContext } from "@/contexts/MemoryContext";
import { useRequestConfirm } from "@vvedantb/app-kit";
import { toast } from "sonner";
import type { ListItem } from "@/lib/list-items";
import { countActiveMemoryViewFilters } from "@/lib/memory-view-filters";
import { useThemeContext } from "@/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";
import { useMemoryListEntries } from "@/hooks/useMemoryListEntries";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";
import {
  MEMORY_PANEL_TRANSITION_NAME,
  VIEW_TRANSITION_TARGET,
  memoryDetailViewTransition,
} from "@/lib/view-transitions";

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
          Add a memory or skill to get started
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
        Try different keywords or clear filters
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

// /memories list view browse + hybrid retrieve, skills merged in
export default function MemorySearch({ memoryId }: MemorySearchProps) {
  const navigate = useNavigate();
  const [params] = useMemoriesSearchParams();
  const list = useMemoryListEntries();
  const { isDark } = useThemeContext();

  const trailTag =
    params.tags.length === 1 ? (params.tags.at(0) ?? null) : null;
  const trailMap = useTrailData({ tag: trailTag });

  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );
  const { request } = useRequestConfirm();
  const { deleteMemory } = useMemoryContext();
  const [previewItem, setPreviewItem] = useState<ListItem | null>(null);
  // row whose title morphs into / out of the detail panel header
  const [transitionSourceId, setTransitionSourceId] = useState<string | null>(
    null,
  );

  // the list only holds slim rows, so the open memory is always read in full
  // (a single-doc reactive query, optimistic updates patch it too)
  const fetchedMemory = useQuery(
    api.memoryApi.get,
    memoryId === null ? "skip" : { memoryId, profileId: list.activeProfileId },
  );
  const isFetchingMemory = memoryId !== null && fetchedMemory === undefined;

  const selectedMemory =
    memoryId === null || !fetchedMemory ? null : memoryFromApi(fetchedMemory);

  // drop stale /$id routes once the fetch settles empty
  useEffect(() => {
    if (memoryId === null || isFetchingMemory || fetchedMemory !== null) return;

    void navigate({
      to: "/$profileId/memories/list",
      params: { profileId: list.activeProfileId },
      search: true,
    });
  }, [
    list.activeProfileId,
    memoryId,
    fetchedMemory,
    isFetchingMemory,
    navigate,
  ]);

  // sparse filters can leave the first pages short or empty: keep paging
  const { needsFill, fetchNextPage } = list;
  useEffect(() => {
    if (needsFill) void fetchNextPage();
  }, [needsFill, fetchNextPage]);

  function openMemory(id: string) {
    setPreviewItem(null);
    setTransitionSourceId(id);
    void navigate({
      to: "/$profileId/memories/list/$id",
      params: { profileId: list.activeProfileId, id },
      search: true,
      viewTransition: memoryDetailViewTransition(),
    });
  }

  function closeMemory({ animate = true }: { animate?: boolean } = {}) {
    setTransitionSourceId(animate ? memoryId : null);
    void navigate({
      to: "/$profileId/memories/list",
      params: { profileId: list.activeProfileId },
      search: true,
      viewTransition: animate ? memoryDetailViewTransition() : false,
    });
  }

  function handleItemSelect(item: ListItem) {
    setPanelAction(null);
    if (previewItem?.id === item.id) {
      startTransition(() => setPreviewItem(null));
      return;
    }
    if (memoryId !== null) {
      // preview replaces the memory synchronously, skip the panel morph
      closeMemory({ animate: false });
      setPreviewItem(item);
      return;
    }
    startTransition(() => setPreviewItem(item));
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
      list.isMemoriesLoading
    ) {
      return;
    }
    void list.fetchNextPage();
  }

  const hasSidePanel = memoryId !== null || previewItem !== null;
  const selectedItemId = memoryId ?? previewItem?.id ?? null;
  const isPanelLoading = memoryId !== null && isFetchingMemory;

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

  const hasActiveFilters =
    countActiveMemoryViewFilters({
      kinds: params.kinds,
      tags: params.tags,
      sources: params.sources,
      types: params.types,
    }) > 0;

  if (list.displayItems.length === 0) {
    if (list.isShowingSearchResults || hasActiveFilters) {
      return <MemoryListStatus variant="no-results" />;
    }
    return <MemoryListStatus variant="empty" />;
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className={cn(
            "flex min-h-0 flex-1 gap-4",
            hasSidePanel ? "flex-col lg:flex-row" : "",
          )}
        >
          <div
            className={cn(
              "min-h-0 min-w-0",
              hasSidePanel ? "hidden sm:block lg:min-w-0 lg:flex-1" : "flex-1",
            )}
          >
            <MemoryVirtuosoList
              entries={list.displayItems}
              selectedItemId={selectedItemId}
              transitionSourceId={memoryId === null ? transitionSourceId : null}
              trailMap={trailMap}
              isDark={isDark}
              onEndReached={handleEndReached}
              handlers={{
                onMemoryClick: handleMemoryClick,
                onItemSelect: handleItemSelect,
                onContextEdit: (memory) => {
                  openMemory(memory.id);
                  setPanelAction("edit");
                },
                onContextDelete: (memory) => {
                  request(
                    () => {
                      openMemory(memory.id);
                      setPanelAction("delete");
                    },
                    () => {
                      void deleteMemory(memory.id)
                        .then(() => {
                          toast.success("Memory deleted successfully");
                        })
                        .catch((err: unknown) => {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Failed to delete memory",
                          );
                        });
                    },
                  );
                },
              }}
            />
          </div>

          {hasSidePanel ? (
            // React animates preview changes, the router rule in globals.css
            // animates memory open/close under the same name
            <ViewTransition name={MEMORY_PANEL_TRANSITION_NAME}>
              <div
                data-vt={VIEW_TRANSITION_TARGET.memoryPanel}
                className="flex h-full min-h-0 w-full flex-col overflow-hidden lg:min-w-0 lg:flex-1"
              >
                <MemoryListSidePanel
                  previewItem={previewItem}
                  selectedMemory={selectedMemory}
                  memoryId={memoryId}
                  isPanelLoading={isPanelLoading}
                  panelAction={panelAction}
                  onClosePreview={() =>
                    startTransition(() => setPreviewItem(null))
                  }
                  onCloseMemory={() => closeMemory()}
                  onMemoryDelete={(deletedId) => {
                    if (memoryId === deletedId) closeMemory();
                  }}
                  onSelectRelated={(memory) => openMemory(memory.id)}
                  onConsumeAction={() => setPanelAction(null)}
                />
              </div>
            </ViewTransition>
          ) : null}
        </div>
      </div>
    </div>
  );
}
