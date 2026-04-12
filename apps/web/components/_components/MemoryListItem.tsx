import {
  Badge,
  Card,
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@vmem/ui";
import { IconEdit, IconTrash } from "@tabler/icons-react";
import { timeAgo, type Memory, type SearchResult } from "@/lib/memories";
import type { TrailEntry } from "@/hooks/useTrailData";

interface MemoryListItemProps {
  item: Memory | SearchResult;
  isSelected: boolean;
  isShowingSearchResults: boolean;
  trailEntry?: TrailEntry;
  onCardClick: (memory: Memory) => void;
  onContextEdit: (memory: Memory) => void;
  onContextDelete: (memory: Memory) => void;
}

export default function MemoryListItem({
  item,
  isSelected,
  isShowingSearchResults,
  trailEntry,
  onCardClick,
  onContextEdit,
  onContextDelete,
}: MemoryListItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          className={cn(
            "cursor-pointer transition-all hover:bg-accent/50 px-3 py-2.5",
            isSelected && "bg-accent",
          )}
          onClick={() => onCardClick(item)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {item.title}
            </span>
            {trailEntry && trailEntry.connectionType === "related" && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 border-violet-400 text-violet-600 dark:border-violet-600 dark:text-violet-400"
              >
                {trailEntry.reason ?? "related"}
              </Badge>
            )}
            {isShowingSearchResults && "relevanceScore" in item && (
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                {Math.round(item.relevanceScore * 100)}%
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground/50 tabular-nums flex-shrink-0">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onContextEdit(item)}>
          <IconEdit size={16} stroke={1.5} />
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onContextDelete(item)}
        >
          <IconTrash size={16} stroke={1.5} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
