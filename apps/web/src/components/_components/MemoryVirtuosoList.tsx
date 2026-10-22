import { Virtuoso } from "react-virtuoso";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
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
  transitionSourceId: string | null;
  trailMap: Map<string, TrailEntry>;
  isDark: boolean;
  // last successful dream run (moon icon); undefined while loading
  lastDreamAt: number | null | undefined;
  handlers: MemoryVirtuosoListHandlers;
}

interface MemoryVirtuosoListProps {
  entries: MemoryListEntry[];
  selectedItemId: string | null;
  // row whose title morphs with the detail panel header
  transitionSourceId?: string | null;
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
        isTransitionSource={context.transitionSourceId === entry.item.id}
        trailEntry={context.trailMap.get(entry.item.id)}
        isDark={context.isDark}
        lastDreamAt={context.lastDreamAt}
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
  transitionSourceId = null,
  trailMap,
  isDark,
  handlers,
  onEndReached,
  className = "scrollbar-thin",
}: MemoryVirtuosoListProps) {
  const profile = useActiveProfile();
  // one query for the whole list, not one per row
  const lastDreamAt = useQuery(api.dream.lastSuccessfulRunAt, {
    profileId: profile._id,
  });
  return (
    <Virtuoso
      data={entries}
      className={className}
      context={{
        selectedItemId,
        transitionSourceId,
        trailMap,
        isDark,
        lastDreamAt,
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
