import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import {
  Badge,
  cn,
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@vmem/ui";
import { IconEdit, IconMoon, IconTrash } from "@tabler/icons-react";
import { IconSkills, IconWiki } from "@/components/sidebar-icons";
import { formatMemorySourceLabel, timeAgo, type Memory } from "@/lib/memories";
import type { ListItem } from "@/lib/list-items";
import type { TrailEntry } from "@/hooks/useTrailData";
import type { MemoryTrace } from "./memory-trace";
import MemoryTraceHover from "./MemoryTraceHover";
import { MemorySourceIcon } from "./MemorySourceIcon";
import { nodeColor } from "./graph-colors";
import ShapeIndicator from "./ShapeIndicator";

interface ListItemRowProps {
  item: ListItem;
  relevanceScore: number | null;
  /** Context Trace for hybrid-search memory hits; enables score hover breakdown. */
  trace?: MemoryTrace;
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
 *  - memory       → navigates to /memories/list/[id] via onMemoryClick
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
  trace,
  isSelected,
  trailEntry,
  isDark,
  onMemoryClick,
  onContextEdit,
  onContextDelete,
}: ListItemRowProps) {
  const navigate = useNavigate();
  const activeProfile = useActiveProfile();
  const color = nodeColor(item.tags, item.kind, isDark, null);
  // Dynamic Dreaming indicator: memories newer than the last dream run
  // haven't been dreamt on yet. Convex dedupes this subscription across
  // rows, so per-row useQuery costs one websocket subscription total.
  const settings = useQuery(api.userSettings.get);
  const awaitingDream =
    item.kind === "memory" &&
    settings !== undefined &&
    (settings.lastDreamRunAt === null ||
      Date.parse(item.createdAt) > settings.lastDreamRunAt);

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
        void navigate({
          to: "/$profileId/wiki/$docId",
          params: { profileId: activeProfile._id, docId: item.wikiId },
        });
        return;
      case "wiki-folder":
        void navigate({
          to: "/$profileId/wiki",
          params: { profileId: activeProfile._id },
        });
        return;
      case "skill":
        void navigate({
          to: "/$profileId/skills/$id",
          params: { profileId: activeProfile._id, id: item.skillId },
        });
        return;
    }
  };

  const rowBody = (
    <div
      className={cn(
        "cursor-pointer rounded-lg px-3 py-2.5 transition-[background-color] hover:bg-surface-tertiary",
        isSelected && "bg-surface-secondary",
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        {item.kind === "wiki-folder" ? (
          <ShapeIndicator
            kind={item.kind}
            color={color}
            className="w-2.5 h-2.5"
          />
        ) : (
          <KindMeta item={item} isSelected={isSelected} />
        )}
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
          {relevanceScore !== null ? (
            trace ? (
              <MemoryTraceHover title={item.title} trace={trace}>
                <span className="text-xs text-muted tabular-nums flex-shrink-0 underline decoration-dotted decoration-muted/40 underline-offset-2">
                  {Math.round(relevanceScore * 100)}%
                </span>
              </MemoryTraceHover>
            ) : (
              <span className="text-xs text-muted tabular-nums flex-shrink-0">
                {Math.round(relevanceScore * 100)}%
              </span>
            )
          ) : null}
          <div className="flex items-center gap-1.5 shrink-0">
            {awaitingDream && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconMoon
                    size={12}
                    stroke={1.5}
                    className="shrink-0 text-muted/60"
                    aria-label="Will be considered in the next dream"
                  />
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  Will be considered in the next dream
                </TooltipContent>
              </Tooltip>
            )}
            {item.kind === "wiki-folder" ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal text-muted whitespace-nowrap"
              >
                {item.childCount} {item.childCount === 1 ? "item" : "items"}
              </Badge>
            ) : (
              <ShapeIndicator
                kind={item.kind}
                color={color}
                className="w-2.5 h-2.5"
              />
            )}
            <span
              className={cn(
                "text-xs tabular-nums whitespace-nowrap",
                isSelected ? "text-foreground" : "text-muted",
              )}
            >
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
          className="text-danger focus:text-danger data-[highlighted]:text-danger"
          onClick={() => onContextDelete(memory)}
        >
          <IconTrash size={16} stroke={1.5} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Renders the kind-specific leading icon for list rows. */
function KindMeta({
  item,
  isSelected,
}: {
  item: ListItem;
  isSelected: boolean;
}) {
  const iconWrapClass = cn(
    "flex h-4 w-4 shrink-0 items-center justify-center",
    isSelected ? "text-foreground" : "text-muted",
  );

  switch (item.kind) {
    case "memory":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={iconWrapClass}
              aria-label={formatMemorySourceLabel(item.source)}
            >
              <MemorySourceIcon source={item.source} size={14} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {formatMemorySourceLabel(item.source)}
          </TooltipContent>
        </Tooltip>
      );
    case "wiki-document":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={iconWrapClass} aria-label="Wiki">
              <IconWiki size={14} stroke={1.7} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            Wiki
          </TooltipContent>
        </Tooltip>
      );
    case "wiki-folder":
      return null;
    case "skill":
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={iconWrapClass} aria-label="Skill">
              <IconSkills size={14} stroke={1.7} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            Skill
          </TooltipContent>
        </Tooltip>
      );
  }
}
