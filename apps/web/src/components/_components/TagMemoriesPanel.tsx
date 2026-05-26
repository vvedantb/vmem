"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card } from "@vmem/ui";
import { IconMoodEmpty, IconX } from "@tabler/icons-react";
import { Virtuoso } from "react-virtuoso";
import type { Memory } from "@/lib/memories";
import { memoryToListItem } from "@/lib/list-items";
import ListItemRow from "@/components/_components/ListItemRow";
import MemoryDetailPanel from "@/components/MemoryDetailPanel";
import { useThemeContext } from "@/components/contexts/ThemeContext";
import { useTrailData } from "@/hooks/useTrailData";

interface TagMemoriesPanelProps {
  tag: string;
  memories: Memory[];
  onClose: () => void;
}

export function TagMemoriesPanel({
  tag,
  memories,
  onClose,
}: TagMemoriesPanelProps) {
  const { theme } = useThemeContext();
  const isDark = theme === "dark";
  const { trailMap } = useTrailData({ tag });

  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  useEffect(() => {
    setSelectedMemoryId(null);
    setPanelAction(null);
  }, [tag]);

  const sortedMemories = useMemo(
    () => [...memories].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [memories],
  );

  const displayItems = useMemo(
    () =>
      sortedMemories.map((memory) => ({
        item: memoryToListItem(memory),
        score: null,
      })),
    [sortedMemories],
  );

  const selectedMemory = useMemo(() => {
    if (!selectedMemoryId) return null;
    return (
      sortedMemories.find((memory) => memory.id === selectedMemoryId) ?? null
    );
  }, [sortedMemories, selectedMemoryId]);

  const handleMemoryUpdate = useCallback((updatedMemory: Memory) => {
    setSelectedMemoryId(updatedMemory.id);
  }, []);

  const handleMemoryDelete = useCallback(
    (deletedId: string) => {
      if (selectedMemoryId === deletedId) {
        setSelectedMemoryId(null);
      }
      if (sortedMemories.length <= 1) {
        onClose();
      }
    },
    [selectedMemoryId, sortedMemories.length, onClose],
  );

  const handleMemoryClick = useCallback(
    (memory: Memory) => {
      setPanelAction(null);
      setSelectedMemoryId(selectedMemoryId === memory.id ? null : memory.id);
    },
    [selectedMemoryId],
  );

  const handleContextEdit = useCallback((memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("edit");
  }, []);

  const handleContextDelete = useCallback((memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("delete");
  }, []);

  const handleConsumeAction = useCallback(() => {
    setPanelAction(null);
  }, []);

  if (selectedMemory) {
    return (
      <MemoryDetailPanel
        memory={selectedMemory}
        onClose={() => setSelectedMemoryId(null)}
        onMemoryUpdate={handleMemoryUpdate}
        onMemoryDelete={handleMemoryDelete}
        onSelectRelated={(memory) => setSelectedMemoryId(memory.id)}
        startInEditMode={panelAction === "edit"}
        startWithDelete={panelAction === "delete"}
        onConsumeAction={handleConsumeAction}
      />
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col shadow-none p-4 sm:p-5 lg:sticky lg:top-4">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold leading-snug text-foreground">
            {tag}
          </h3>
          <p className="mt-0.5 text-xs text-muted tabular-nums">
            {memories.length} {memories.length === 1 ? "memory" : "memories"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close tag memories"
          onClick={onClose}
          className="shrink-0 text-muted"
        >
          <IconX size={18} />
        </Button>
      </div>

      {displayItems.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <IconMoodEmpty size={24} className="mb-3 text-muted" stroke={1.5} />
          <p className="text-sm font-medium text-foreground">No memories</p>
          <p className="mt-1 max-w-[240px] text-sm text-muted">
            This tag is not on any memories in the current profile.
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <Virtuoso
            data={displayItems}
            computeItemKey={(_index, entry) => entry.item.id}
            defaultItemHeight={44}
            itemContent={(_index, entry) => (
              <div className="pb-1.5">
                <ListItemRow
                  item={entry.item}
                  relevanceScore={entry.score}
                  isSelected={selectedMemoryId === entry.item.id}
                  trailEntry={trailMap.get(entry.item.id)}
                  isDark={isDark}
                  onMemoryClick={handleMemoryClick}
                  onContextEdit={handleContextEdit}
                  onContextDelete={handleContextDelete}
                />
              </div>
            )}
            style={{ height: "100%" }}
          />
        </div>
      )}
    </Card>
  );
}
