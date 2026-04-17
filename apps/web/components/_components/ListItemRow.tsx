"use client";

import { useRouter } from "next/navigation";
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
import { formatMemorySourceLabel, timeAgo, type Memory } from "@/lib/memories";
import type { ListItem } from "@/lib/list-items";
import type { TrailEntry } from "@/hooks/useTrailData";
import { nodeColor } from "./graph-colors";
import ShapeIndicator from "./ShapeIndicator";

interface ListItemRowProps {
  item: ListItem;
  relevanceScore: number | null;
  isSelected: boolean;
  trailEntry?: TrailEntry;
  isDark: boolean;
  onMemoryClick: (memory: Memory) => void;
  onContextEdit: (memory: Memory) => void;
  onContextDelete: (memory: Memory) => void;
}

/**
 * Renders a single row in the unified /memories list. The row dispatches on
 * `item.kind` for both visual meta (source badge for memories, child count for
 * folders, etc.) and click behaviour:
 *
 *  - memory       → toggles the inline detail panel via onMemoryClick
 *  - wiki-doc     → navigates to /wiki?doc=<id>
 *  - wiki-folder  → navigates to /wiki (no deep-link to folder yet)
 *  - skill        → navigates to /skills
 *
 * Edit/Delete context menu actions only exist for memories; non-memory rows
 * render without the ContextMenu wrapper so right-click falls through to the
 * browser default.
 */
export default function ListItemRow({
  item,
  relevanceScore,
  isSelected,
  trailEntry,
  isDark,
  onMemoryClick,
  onContextEdit,
  onContextDelete,
}: ListItemRowProps) {
  const router = useRouter();
  const color = nodeColor(item.tags, item.kind, isDark, null);

  const handleClick = () => {
    switch (item.kind) {
      case "memory": {
        // Re-materialise the Memory shape from the list item so the callback
        // keeps working on Memory — the detail panel + mutations expect it.
        const memory: Memory = {
          id: item.id,
          title: item.title,
          content: item.content,
          tags: item.tags,
          createdAt: item.createdAt,
          type: item.type,
          source: item.source,
        };
        onMemoryClick(memory);
        return;
      }
      case "wiki-document":
        router.push(`/wiki?doc=${item.wikiId}`);
        return;
      case "wiki-folder":
        router.push("/wiki");
        return;
      case "skill":
        router.push("/skills");
        return;
    }
  };

  const rowBody = (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:bg-accent/50 px-3 py-2.5",
        isSelected && "bg-accent",
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        <ShapeIndicator
          kind={item.kind}
          color={color}
          className="w-2.5 h-2.5"
        />
        <span className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
          {item.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {trailEntry && trailEntry.connectionType === "related" && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0 border-violet-400 text-violet-600 dark:border-violet-600 dark:text-violet-400"
            >
              {trailEntry.reason ?? "related"}
            </Badge>
          )}
          {relevanceScore !== null && (
            <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
              {Math.round(relevanceScore * 100)}%
            </span>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <KindMeta item={item} />
            <span className="text-xs text-muted-foreground/50 tabular-nums whitespace-nowrap">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );

  if (item.kind !== "memory") {
    return rowBody;
  }

  // Materialised once per render; cheap enough and keeps handlers typed to Memory.
  const memory: Memory = {
    id: item.id,
    title: item.title,
    content: item.content,
    tags: item.tags,
    createdAt: item.createdAt,
    type: item.type,
    source: item.source,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{rowBody}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onContextEdit(memory)}>
          <IconEdit size={16} stroke={1.5} />
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onContextDelete(memory)}
        >
          <IconTrash size={16} stroke={1.5} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Renders the kind-specific badge on the right side of the row. */
function KindMeta({ item }: { item: ListItem }) {
  switch (item.kind) {
    case "memory":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted-foreground border-border whitespace-nowrap"
        >
          {formatMemorySourceLabel(item.source)}
        </Badge>
      );
    case "wiki-document":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted-foreground border-border whitespace-nowrap"
        >
          Wiki
        </Badge>
      );
    case "wiki-folder":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted-foreground border-border whitespace-nowrap"
        >
          {item.childCount} {item.childCount === 1 ? "item" : "items"}
        </Badge>
      );
    case "skill":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted-foreground border-border whitespace-nowrap"
        >
          Skill
        </Badge>
      );
  }
}
