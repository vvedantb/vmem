import type { ButtonHTMLAttributes, MouseEvent } from "react";
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

export type WikiTreeRowProps = {
  node: WikiListNode;
  isFolder: boolean;
  expanded: boolean;
  highlighted: boolean;
  isBulkSelect: boolean;
  isChecked: boolean;
  isDragging: boolean;
  // headless tree item.getProps() spreads onto the row button
  itemProps: ButtonHTMLAttributes<HTMLButtonElement>;
  onToggleExpanded: (e: MouseEvent) => void;
  onCreateInside: (
    parentId: WikiNodeId,
    kind: "folder" | "document" | "artifact",
  ) => void;
  onRequestRename: (node: WikiListNode) => void;
  onRequestDelete: (node: WikiListNode) => void;
};

export function WikiTreeRow({
  node,
  isFolder,
  expanded,
  highlighted,
  isBulkSelect,
  isChecked,
  isDragging,
  itemProps,
  onToggleExpanded,
  onCreateInside,
  onRequestRename,
  onRequestDelete,
}: WikiTreeRowProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          {...itemProps}
          className={cn(
            "group h-auto w-full justify-start gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-normal transition-[background-color,color] active:scale-100",
            highlighted
              ? "bg-surface-tertiary font-medium text-foreground hover:bg-surface-tertiary"
              : "text-muted hover:bg-surface-tertiary/50 hover:text-foreground",
            isDragging ? "opacity-40" : null,
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
              onPointerDown={(e) => e.stopPropagation()}
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
      </ContextMenuTrigger>
      <ContextMenuContent>
        {isFolder ? (
          <WikiFolderCreateMenuItems
            parentId={node._id}
            onCreateInside={onCreateInside}
          />
        ) : null}
        <WikiNodeActionMenuItems
          node={node}
          onRequestRename={onRequestRename}
          onRequestDelete={onRequestDelete}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
