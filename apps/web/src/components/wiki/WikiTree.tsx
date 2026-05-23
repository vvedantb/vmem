"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import {
  IconChevronRight,
  IconFolder,
  IconFolderOpen,
  IconFileText,
  IconPlus,
  IconFolderPlus,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Label,
  Switch,
  cn,
} from "@vmem/ui";
import type { WikiTreeNode } from "./_utils";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface WikiTreeProps {
  tree: WikiTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  outlineVisible: boolean;
  onOutlineVisibleChange: (visible: boolean) => void;
  hasDoc: boolean;
  wordCount: number;
}

/**
 * Left-pane document/folder tree. Right-click a node for New/Rename/Delete.
 * Click a document to open it in the center pane. Click a folder chevron to toggle.
 *
 * Kept as one file so the recursive `TreeItem` can stay co-located with the
 * context-menu + dialog state; pulling it apart would just fragment the logic.
 */
export default function WikiTree({
  tree,
  selectedId,
  onSelect,
  outlineVisible,
  onOutlineVisibleChange,
  hasDoc,
  wordCount,
}: WikiTreeProps) {
  const createNode = useMutation(api.wiki.createNode);
  const renameNode = useMutation(api.wiki.renameNode);
  const deleteNode = useMutation(api.wiki.deleteNode);

  const [renameTarget, setRenameTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );

  const handleCreateRoot = useCallback(
    async (kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId: undefined, kind, title });
      if (kind === "document") {
        onSelect(newId);
      }
    },
    [createNode, onSelect],
  );

  const handleCreateInFolder = useCallback(
    async (parentId: Id<"wikiNodes">, kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId, kind, title });
      if (kind === "document") {
        onSelect(newId);
      }
    },
    [createNode, onSelect],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 w-full">
      <div className="flex items-center justify-between mb-2 gap-2 px-1 shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Documents
        </span>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handleCreateRoot("folder")}
            title="New folder"
          >
            <IconFolder size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void handleCreateRoot("document")}
            title="New document"
          >
            <IconPlus size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No documents yet. Click + to create one.
          </p>
        ) : (
          <ul className="flex flex-col">
            {tree.map((item) => (
              <TreeItem
                key={item.node._id}
                item={item}
                depth={0}
                selectedId={selectedId}
                onSelect={onSelect}
                onCreateInside={handleCreateInFolder}
                onRequestRename={setRenameTarget}
                onRequestDelete={setDeleteTarget}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 px-1 pt-2 shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <Switch
            id="wiki-view-outline"
            checked={outlineVisible}
            disabled={!hasDoc}
            onCheckedChange={onOutlineVisibleChange}
            aria-label="View outline"
          />
          <Label
            htmlFor="wiki-view-outline"
            className={cn(
              "cursor-pointer text-sm font-medium",
              hasDoc ? "text-foreground" : "text-muted-foreground",
            )}
          >
            View outline
          </Label>
        </div>
        {hasDoc ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
          </span>
        ) : null}
      </div>

      <RenameDialog
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onConfirm={async (id, title) => {
          await renameNode({ id, title });
          setRenameTarget(null);
        }}
      />
      <DeleteConfirmDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (id) => {
          await deleteNode({ id });
          setDeleteTarget(null);
          if (selectedId === id) onSelect("");
        }}
      />
    </div>
  );
}

interface TreeItemProps {
  item: WikiTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateInside: (
    parentId: Id<"wikiNodes">,
    kind: "folder" | "document",
  ) => void;
  onRequestRename: (node: Doc<"wikiNodes">) => void;
  onRequestDelete: (node: Doc<"wikiNodes">) => void;
}

function TreeItem({
  item,
  depth,
  selectedId,
  onSelect,
  onCreateInside,
  onRequestRename,
  onRequestDelete,
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isFolder = item.node.kind === "folder";
  const isSelected = selectedId === item.node._id;

  const handleActivate = () => {
    if (isFolder) {
      setExpanded((prev) => !prev);
    } else {
      onSelect(item.node._id);
    }
  };

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={handleActivate}
            className={cn(
              "group w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              "hover:bg-muted/70",
              isSelected && "bg-muted text-foreground",
              !isSelected && "text-foreground/80",
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {isFolder ? (
              <>
                <IconChevronRight
                  size={14}
                  className={cn(
                    "text-muted-foreground transition-transform",
                    expanded && "rotate-90",
                  )}
                />
                {expanded ? (
                  <IconFolderOpen size={14} className="text-muted-foreground" />
                ) : (
                  <IconFolder size={14} className="text-muted-foreground" />
                )}
              </>
            ) : (
              <>
                <span className="inline-block w-[14px]" />
                <IconFileText size={14} className="text-muted-foreground" />
              </>
            )}
            <span className="truncate">{item.node.title}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {isFolder && (
            <>
              <ContextMenuItem
                onSelect={() => onCreateInside(item.node._id, "document")}
              >
                <IconFileText size={16} className="text-muted-foreground" />
                New document
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => onCreateInside(item.node._id, "folder")}
              >
                <IconFolderPlus size={16} className="text-muted-foreground" />
                New folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => onRequestRename(item.node)}>
            <IconPencil size={16} className="text-muted-foreground" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => onRequestDelete(item.node)}
            className="text-destructive focus:text-destructive"
          >
            <IconTrash size={16} />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {isFolder && expanded && item.children.length > 0 && (
        <ul>
          {item.children.map((child) => (
            <TreeItem
              key={child.node._id}
              item={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onCreateInside={onCreateInside}
              onRequestRename={onRequestRename}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
