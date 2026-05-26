import { useNavigate } from "@tanstack/react-router";
import {
  Badge,
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
 *  - wiki-doc     → navigates to /wiki/<id>
 *  - wiki-folder  → navigates to /wiki (no deep-link to folder yet)
 *  - skill        → navigates to /skills/[id]
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
  const navigate = useNavigate();
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
          sourceUrl: item.sourceUrl,
          sourceSyncedAt: item.sourceSyncedAt,
        };
        onMemoryClick(memory);
        return;
      }
      case "wiki-document":
        navigate({ to: "/wiki/$docId", params: { docId: item.wikiId } });
        return;
      case "wiki-folder":
        navigate({ to: "/wiki" });
        return;
      case "skill":
        navigate({ to: "/skills/$id", params: { id: item.skillId } });
        return;
    }
  };

  const rowBody = (
    <div
      className={cn(
        "cursor-pointer rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary/50",
        isSelected && "bg-surface-secondary/40",
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
              className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0"
            >
              {trailEntry.reason ?? "related"}
            </Badge>
          )}
          {relevanceScore !== null && (
            <span className="text-xs text-muted tabular-nums flex-shrink-0">
              {Math.round(relevanceScore * 100)}%
            </span>
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <KindMeta item={item} />
            <span className="text-xs text-muted/50 tabular-nums whitespace-nowrap">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
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
    sourceUrl: item.sourceUrl,
    sourceSyncedAt: item.sourceSyncedAt,
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
          className="text-danger focus:text-danger"
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
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted whitespace-nowrap"
        >
          {formatMemorySourceLabel(item.source)}
        </Badge>
      );
    case "wiki-document":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted whitespace-nowrap"
        >
          Wiki
        </Badge>
      );
    case "wiki-folder":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted whitespace-nowrap"
        >
          {item.childCount} {item.childCount === 1 ? "item" : "items"}
        </Badge>
      );
    case "skill":
      return (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted whitespace-nowrap"
        >
          Skill
        </Badge>
      );
  }
}
