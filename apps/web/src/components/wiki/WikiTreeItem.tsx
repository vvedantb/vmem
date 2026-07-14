"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Doc, Id } from "@vmem/backend";
import {
  IconChevronRight,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import {
  Button,
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
} from "@vmem/ui";
import type { WikiTreeNode } from "./_utils";
import { WIKI_ROOT_DROP_ID } from "./_utils";

// scroll container that doubles as the "move to top level" drop target
export function WikiRootDropZone({
  disabled,
  children,
}: {
  disabled: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: WIKI_ROOT_DROP_ID,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 min-h-0 overflow-y-auto scrollbar-thin rounded-md transition-[background-color]",
        // isOver is only set during an active drag, so this is the drop hint
        isOver ? "bg-surface-secondary/40" : null,
      )}
    >
      {children}
    </div>
  );
}

// floating preview rendered under the cursor while dragging a row
export function WikiDragPreview({ node }: { node: Doc<"wikiNodes"> }) {
  const isFolder = node.kind === "folder";
  return (
    <div className="flex max-w-[220px] items-center gap-1.5 rounded-md bg-surface-tertiary px-2 py-1.5 text-sm text-foreground shadow-lg">
      {isFolder ? (
        <IconFolder size={14} className="shrink-0 text-muted" />
      ) : (
        <IconFileText size={14} className="shrink-0 text-muted" />
      )}
      <span className="truncate">{node.title}</span>
    </div>
  );
}

export interface WikiTreeListProps {
  nodes: WikiTreeNode[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectionMode: boolean;
  selectedNodeIds?: ReadonlySet<Id<"wikiNodes">>;
  onToggleSelect?: (id: Id<"wikiNodes">) => void;
  onCreateInside: (
    parentId: Id<"wikiNodes">,
    kind: "folder" | "document",
  ) => void;
  onRequestRename: (node: Doc<"wikiNodes">) => void;
  onRequestDelete: (node: Doc<"wikiNodes">) => void;
}

export function WikiTreeList({
  nodes,
  depth,
  selectedId,
  onSelect,
  selectionMode,
  selectedNodeIds,
  onToggleSelect,
  onCreateInside,
  onRequestRename,
  onRequestDelete,
}: WikiTreeListProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((item) => (
        <WikiTreeItem
          key={item.node._id}
          item={item}
          depth={depth}
          selectedId={selectedId}
          onSelect={onSelect}
          selectionMode={selectionMode}
          selectedNodeIds={selectedNodeIds}
          onToggleSelect={onToggleSelect}
          onCreateInside={onCreateInside}
          onRequestRename={onRequestRename}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </div>
  );
}

interface WikiTreeItemProps {
  item: WikiTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectionMode: boolean;
  selectedNodeIds?: ReadonlySet<Id<"wikiNodes">>;
  onToggleSelect?: (id: Id<"wikiNodes">) => void;
  onCreateInside: (
    parentId: Id<"wikiNodes">,
    kind: "folder" | "document",
  ) => void;
  onRequestRename: (node: Doc<"wikiNodes">) => void;
  onRequestDelete: (node: Doc<"wikiNodes">) => void;
}

function WikiTreeItem({
  item,
  depth,
  selectedId,
  onSelect,
  selectionMode,
  selectedNodeIds,
  onToggleSelect,
  onCreateInside,
  onRequestRename,
  onRequestDelete,
}: WikiTreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isFolder = item.node.kind === "folder";
  const isChecked = selectedNodeIds?.has(item.node._id) ?? false;
  const highlighted = selectionMode ? isChecked : selectedId === item.node._id;

  // the row is draggable; folders are also a drop target to nest into
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.node._id, disabled: selectionMode });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: item.node._id,
    disabled: !isFolder || selectionMode,
  });

  const handleActivate = () => {
    if (selectionMode) {
      onToggleSelect?.(item.node._id);
      return;
    }
    if (isFolder) {
      setExpanded((prev) => !prev);
    } else {
      onSelect(item.node._id);
    }
  };

  return (
    <>
      <div
        ref={setDropRef}
        className={cn(
          "rounded-md transition-[background-color]",
          // highlight the folder being hovered as a drop target
          isOver && "bg-surface-tertiary ring-1 ring-primary",
        )}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              ref={setDragRef}
              onClick={handleActivate}
              style={{
                transform: CSS.Translate.toString(transform),
                opacity: isDragging ? 0.4 : undefined,
              }}
              {...attributes}
              {...listeners}
              className={cn(
                "group h-auto w-full justify-start gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-normal transition-[background-color,color] active:scale-100",
                highlighted
                  ? "bg-surface-tertiary font-medium text-foreground hover:bg-surface-tertiary"
                  : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
              )}
            >
              {selectionMode ? (
                <Checkbox
                  checked={isChecked}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none shrink-0"
                />
              ) : null}
              {isFolder ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={expanded ? "Collapse folder" : "Expand folder"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((prev) => !prev);
                  }}
                  className="inline-flex shrink-0"
                >
                  <IconChevronRight
                    size={14}
                    className={cn(
                      "text-muted transition-transform",
                      expanded && "rotate-90",
                    )}
                  />
                </span>
              ) : (
                <span className="inline-block w-[14px] shrink-0" />
              )}
              <span className="truncate">{item.node.title}</span>
              {isFolder && item.node.sourceCodebaseId ? (
                <span
                  title="Generated from a synced codebase"
                  className="ml-auto inline-flex shrink-0"
                >
                  <IconDatabase size={13} className="text-muted" />
                </span>
              ) : null}
            </Button>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {isFolder && (
              <>
                <ContextMenuItem
                  onSelect={() => onCreateInside(item.node._id, "document")}
                >
                  <IconFileText size={16} className="text-muted" />
                  New document
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => onCreateInside(item.node._id, "folder")}
                >
                  <IconFolderPlus size={16} className="text-muted" />
                  New folder
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onSelect={() => onRequestRename(item.node)}>
              <IconPencil size={16} className="text-muted" />
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => onRequestDelete(item.node)}
              className="text-danger focus:text-danger data-[highlighted]:text-danger"
            >
              <IconTrash size={16} />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {isFolder && expanded && item.children.length > 0 ? (
        <div className="ml-[15px] border-l border-separator pl-2">
          <WikiTreeList
            nodes={item.children}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            selectionMode={selectionMode}
            selectedNodeIds={selectedNodeIds}
            onToggleSelect={onToggleSelect}
            onCreateInside={onCreateInside}
            onRequestRename={onRequestRename}
            onRequestDelete={onRequestDelete}
          />
        </div>
      ) : null}
    </>
  );
}
