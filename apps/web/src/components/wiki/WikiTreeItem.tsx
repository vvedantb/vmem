import { useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { WikiListNode, WikiNodeId } from "./-types";
import {
  IconChevronRight,
  IconCode,
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

type WikiTreeMode = "navigate" | "bulk-select";

type WikiCreateKind = "folder" | "document" | "artifact";

function WikiKindIcon({
  kind,
  size = 14,
}: {
  kind: WikiListNode["kind"];
  size?: number;
}) {
  if (kind === "folder") {
    return <IconFolder size={size} className="shrink-0 text-muted" />;
  }
  if (kind === "artifact") {
    return <IconCode size={size} className="shrink-0 text-muted" />;
  }
  return <IconFileText size={size} className="shrink-0 text-muted" />;
}

function WikiFolderCreateMenuItems({
  parentId,
  onCreateInside,
}: {
  parentId: WikiNodeId;
  onCreateInside: (parentId: WikiNodeId, kind: WikiCreateKind) => void;
}) {
  return (
    <>
      <ContextMenuItem onSelect={() => onCreateInside(parentId, "document")}>
        <IconFileText size={16} className="text-muted" />
        New document
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCreateInside(parentId, "artifact")}>
        <IconCode size={16} className="text-muted" />
        New artifact
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => onCreateInside(parentId, "folder")}>
        <IconFolderPlus size={16} className="text-muted" />
        New folder
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}

function WikiNodeActionMenuItems({
  node,
  onRequestRename,
  onRequestDelete,
}: {
  node: WikiListNode;
  onRequestRename: (node: WikiListNode) => void;
  onRequestDelete: (node: WikiListNode) => void;
}) {
  return (
    <>
      <ContextMenuItem onSelect={() => onRequestRename(node)}>
        <IconPencil size={16} className="text-muted" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => onRequestDelete(node)}
        className="text-danger focus:text-danger data-[highlighted]:text-danger"
      >
        <IconTrash size={16} />
        Delete
      </ContextMenuItem>
    </>
  );
}

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
        isOver ? "bg-surface-secondary/40" : null,
      )}
    >
      {children}
    </div>
  );
}

// floating preview rendered under the cursor while dragging a row
export function WikiDragPreview({ node }: { node: WikiListNode }) {
  return (
    <div className="flex max-w-[220px] items-center gap-1.5 rounded-md bg-surface-tertiary px-2 py-1.5 text-sm text-foreground shadow-lg">
      <WikiKindIcon kind={node.kind} />
      <span className="truncate">{node.title}</span>
    </div>
  );
}

export interface WikiTreeListProps {
  nodes: WikiTreeNode[];
  depth: number;
  selectedId: string | null;
  onSelect: (id: WikiNodeId | "") => void;
  mode: WikiTreeMode;
  selectedNodeIds?: ReadonlySet<WikiNodeId>;
  onToggleSelect?: (id: WikiNodeId) => void;
  onCreateInside: (
    parentId: WikiNodeId,
    kind: "folder" | "document" | "artifact",
  ) => void;
  onRequestRename: (node: WikiListNode) => void;
  onRequestDelete: (node: WikiListNode) => void;
}

export function WikiTreeList({
  nodes,
  depth,
  selectedId,
  onSelect,
  mode,
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
          mode={mode}
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
  onSelect: (id: WikiNodeId | "") => void;
  mode: WikiTreeMode;
  selectedNodeIds?: ReadonlySet<WikiNodeId>;
  onToggleSelect?: (id: WikiNodeId) => void;
  onCreateInside: (
    parentId: WikiNodeId,
    kind: "folder" | "document" | "artifact",
  ) => void;
  onRequestRename: (node: WikiListNode) => void;
  onRequestDelete: (node: WikiListNode) => void;
}

function WikiTreeItem(props: WikiTreeItemProps) {
  const [expanded, setExpanded] = useState(props.depth === 0);
  const isFolder = props.item.node.kind === "folder";
  const isBulkSelect = props.mode === "bulk-select";
  const highlighted = isBulkSelect
    ? (props.selectedNodeIds?.has(props.item.node._id) ?? false)
    : props.selectedId === props.item.node._id;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({
    id: props.item.node._id,
    disabled: isBulkSelect,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: props.item.node._id,
    disabled: !isFolder || isBulkSelect,
  });

  const handleActivate = () => {
    if (isBulkSelect) {
      props.onToggleSelect?.(props.item.node._id);
      return;
    }
    if (isFolder) {
      setExpanded((prev) => !prev);
      return;
    }
    props.onSelect(props.item.node._id);
  };

  const toggleExpanded = (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  return (
    <>
      <div
        ref={isBulkSelect ? undefined : setDropRef}
        className={cn(
          "rounded-md transition-[background-color]",
          !isBulkSelect && isOver
            ? "bg-surface-tertiary ring-1 ring-primary"
            : null,
        )}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <WikiTreeRow
              node={props.item.node}
              isFolder={isFolder}
              expanded={expanded}
              highlighted={highlighted}
              isBulkSelect={isBulkSelect}
              isChecked={
                props.selectedNodeIds?.has(props.item.node._id) ?? false
              }
              dragRef={isBulkSelect ? undefined : setDragRef}
              dragStyle={
                isBulkSelect
                  ? undefined
                  : {
                      transform: CSS.Translate.toString(transform),
                      opacity: isDragging ? 0.4 : undefined,
                    }
              }
              dragAttributes={isBulkSelect ? undefined : attributes}
              dragListeners={isBulkSelect ? undefined : listeners}
              onActivate={handleActivate}
              onToggleExpanded={toggleExpanded}
            />
          </ContextMenuTrigger>
          <ContextMenuContent>
            {isFolder ? (
              <WikiFolderCreateMenuItems
                parentId={props.item.node._id}
                onCreateInside={props.onCreateInside}
              />
            ) : null}
            <WikiNodeActionMenuItems
              node={props.item.node}
              onRequestRename={props.onRequestRename}
              onRequestDelete={props.onRequestDelete}
            />
          </ContextMenuContent>
        </ContextMenu>
      </div>

      {isFolder && expanded && props.item.children.length > 0 ? (
        <div className="ml-[15px] border-l border-separator pl-2">
          <WikiTreeList
            nodes={props.item.children}
            depth={props.depth + 1}
            selectedId={props.selectedId}
            onSelect={props.onSelect}
            mode={props.mode}
            selectedNodeIds={props.selectedNodeIds}
            onToggleSelect={props.onToggleSelect}
            onCreateInside={props.onCreateInside}
            onRequestRename={props.onRequestRename}
            onRequestDelete={props.onRequestDelete}
          />
        </div>
      ) : null}
    </>
  );
}

type WikiTreeRowProps = {
  node: WikiListNode;
  isFolder: boolean;
  expanded: boolean;
  highlighted: boolean;
  isBulkSelect: boolean;
  isChecked: boolean;
  dragRef?: (element: HTMLElement | null) => void;
  dragStyle?: CSSProperties;
  dragAttributes?: DraggableAttributes;
  dragListeners?: Record<string, unknown>;
  onActivate: () => void;
  onToggleExpanded: (e: MouseEvent) => void;
};

function WikiTreeRow({
  node,
  isFolder,
  expanded,
  highlighted,
  isBulkSelect,
  isChecked,
  dragRef,
  dragStyle,
  dragAttributes,
  dragListeners,
  onActivate,
  onToggleExpanded,
}: WikiTreeRowProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      ref={dragRef}
      onClick={onActivate}
      style={dragStyle}
      {...dragAttributes}
      {...dragListeners}
      className={cn(
        "group h-auto w-full justify-start gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-normal transition-[background-color,color] active:scale-100",
        highlighted
          ? "bg-surface-tertiary font-medium text-foreground hover:bg-surface-tertiary"
          : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
      )}
    >
      {isBulkSelect ? (
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
          onClick={onToggleExpanded}
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
      <WikiKindIcon kind={node.kind} />
      <span className="truncate">{node.title}</span>
      {isFolder && node.sourceCodebaseId ? (
        <span
          title="Generated from a synced codebase"
          className="ml-auto inline-flex shrink-0"
        >
          <IconDatabase size={13} className="text-muted" />
        </span>
      ) : null}
    </Button>
  );
}
