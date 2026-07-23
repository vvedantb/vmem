import { useState } from "react";
import { Button, Card } from "@vmem/ui";
import { IconMoodEmpty, IconX } from "@tabler/icons-react";
import type { Memory } from "@/lib/memories";
import { memoryToListItem } from "@/lib/list-items";
import { MemoryVirtuosoList } from "@/components/_components/MemoryVirtuosoList";
import MemoryDetailPanel from "@/components/memories/MemoryDetailPanel";
import { useThemeContext } from "@/contexts/ThemeContext";
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
  const { isDark } = useThemeContext();
  const trailMap = useTrailData({ tag });

  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [panelAction, setPanelAction] = useState<"edit" | "delete" | null>(
    null,
  );

  const sortedMemories = [...memories].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  const displayItems = sortedMemories.map((memory) => ({
    item: memoryToListItem(memory),
    score: null,
  }));

  const selectedMemory = selectedMemoryId
    ? (sortedMemories.find((memory) => memory.id === selectedMemoryId) ?? null)
    : null;

  const handleMemoryDelete = (deletedId: string) => {
    if (selectedMemoryId === deletedId) {
      setSelectedMemoryId(null);
    }
    if (sortedMemories.length <= 1) {
      onClose();
    }
  };

  const handleMemoryClick = (memory: Memory) => {
    setPanelAction(null);
    setSelectedMemoryId(selectedMemoryId === memory.id ? null : memory.id);
  };

  const handleContextEdit = (memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("edit");
  };

  const handleContextDelete = (memory: Memory) => {
    setSelectedMemoryId(memory.id);
    setPanelAction("delete");
  };

  const handleConsumeAction = () => {
    setPanelAction(null);
  };

  if (selectedMemory) {
    return (
      <MemoryDetailPanel
        key={selectedMemory.id}
        memory={selectedMemory}
        onClose={() => setSelectedMemoryId(null)}
        onMemoryDelete={handleMemoryDelete}
        onSelectRelated={(memory) => setSelectedMemoryId(memory.id)}
        initialAction={panelAction ?? undefined}
        onConsumeAction={handleConsumeAction}
      />
    );
  }

  return (
    <Card className="flex h-full min-h-0 flex-col shadow-none p-4 sm:p-5">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold leading-snug text-foreground text-balance">
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
          <MemoryVirtuosoList
            entries={displayItems}
            selectedItemId={selectedMemoryId}
            trailMap={trailMap}
            isDark={isDark}
            handlers={{
              onMemoryClick: handleMemoryClick,
              onItemSelect: () => {},
              onContextEdit: handleContextEdit,
              onContextDelete: handleContextDelete,
            }}
          />
        </div>
      )}
    </Card>
  );
}
