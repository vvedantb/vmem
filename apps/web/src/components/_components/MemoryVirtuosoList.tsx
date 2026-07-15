import { Virtuoso } from "react-virtuoso";
import ListItemRow from "@/components/_components/ListItemRow";
import type { MemoryListEntry } from "@/hooks/useMemoryListEntries";
import type { TrailEntry } from "@/hooks/useTrailData";
import type { Memory } from "@/lib/memories";
import type { ListItem } from "@/lib/list-items";

interface MemoryVirtuosoListHandlers {
  onMemoryClick: (memory: Memory) => void;
  onItemSelect: (item: ListItem) => void;
  onContextEdit: (memory: Memory) => void;
  onContextDelete: (memory: Memory) => void;
}

interface MemoryVirtuosoListContext {
  selectedItemId: string | null;
  trailMap: Map<string, TrailEntry>;
  isDark: boolean;
  handlers: MemoryVirtuosoListHandlers;
}

interface MemoryVirtuosoListProps {
  entries: MemoryListEntry[];
  selectedItemId: string | null;
  trailMap: Map<string, TrailEntry>;
  isDark: boolean;
  handlers: MemoryVirtuosoListHandlers;
  onEndReached?: () => void;
  className?: string;
}

function MemoryVirtuosoRow({
  entry,
  context,
}: {
  entry: MemoryListEntry;
  context?: MemoryVirtuosoListContext;
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
        onMemoryClick={context.handlers.onMemoryClick}
        onItemSelect={context.handlers.onItemSelect}
        onContextEdit={context.handlers.onContextEdit}
        onContextDelete={context.handlers.onContextDelete}
      />
    </div>
  );
}

function renderMemoryVirtuosoRow(
  _index: number,
  entry: MemoryListEntry,
  context?: MemoryVirtuosoListContext,
) {
  return <MemoryVirtuosoRow entry={entry} context={context} />;
}

export function MemoryVirtuosoList({
  entries,
  selectedItemId,
  trailMap,
  isDark,
  handlers,
  onEndReached,
  className = "scrollbar-thin",
}: MemoryVirtuosoListProps) {
  return (
    <Virtuoso
      data={entries}
      className={className}
      context={{
        selectedItemId,
        trailMap,
        isDark,
        handlers,
      }}
      computeItemKey={(_index, entry) => entry.item.id}
      defaultItemHeight={44}
      endReached={onEndReached}
      itemContent={renderMemoryVirtuosoRow}
      style={{ height: "100%" }}
    />
  );
}
