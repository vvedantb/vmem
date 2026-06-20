"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import {
  IconChevronRight,
  IconDatabase,
  IconFileText,
  IconFolderPlus,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import {
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
} from "@vmem/ui";
import type { WikiTreeNode } from "./_utils";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { optimisticId } from "@/lib/optimisticId";
import { useActiveTeamId } from "@/components/workspace/active-profile";

interface WikiTreeProps {
  tree: WikiTreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** When true, rows show checkboxes and clicking toggles selection instead of opening. */
  selectionMode?: boolean;
  selectedNodeIds?: ReadonlySet<Id<"wikiNodes">>;
  onToggleSelect?: (id: Id<"wikiNodes">) => void;
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
  selectionMode = false,
  selectedNodeIds,
  onToggleSelect,
}: WikiTreeProps) {
  const teamId = useActiveTeamId();
  const createNode = useMutation(api.wiki.createNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
      if (!tree || tree.length === 0) return;
      const siblings = tree.filter((n) => n.parentId === args.parentId);
      const nextOrder =
        siblings.length === 0
          ? 0
          : Math.max(...siblings.map((s) => s.order)) + 1;
      const now = Date.now();
      const tempId = optimisticId("wikiNodes");
      const row: Doc<"wikiNodes"> = {
        _id: tempId,
        _creationTime: now,
        userId: tree[0].userId,
        teamId,
        parentId: args.parentId,
        kind: args.kind,
        title: args.title,
        content: args.kind === "document" ? "" : undefined,
        contentText: args.kind === "document" ? "" : undefined,
        order: nextOrder,
        createdAt: now,
        updatedAt: now,
      };
      localStore.setQuery(api.wiki.listTree, { teamId }, [...tree, row]);
    },
  );
  const renameNode = useMutation(api.wiki.renameNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
      if (tree) {
        localStore.setQuery(
          api.wiki.listTree,
          { teamId },
          tree.map((node) =>
            node._id === args.id
              ? { ...node, title: args.title, updatedAt: Date.now() }
              : node,
          ),
        );
      }
      const node = localStore.getQuery(api.wiki.getNode, { id: args.id });
      if (node) {
        localStore.setQuery(
          api.wiki.getNode,
          { id: args.id },
          { ...node, title: args.title, updatedAt: Date.now() },
        );
      }
    },
  );
  const deleteNode = useMutation(api.wiki.deleteNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
      if (!tree) return;
      const childrenByParent = new Map<string, Array<Id<"wikiNodes">>>();
      for (const node of tree) {
        const key = node.parentId ?? "__root__";
        const list = childrenByParent.get(key) ?? [];
        list.push(node._id);
        childrenByParent.set(key, list);
      }
      const remove = new Set<string>([args.id]);
      const stack: Array<Id<"wikiNodes">> = [args.id];
      while (stack.length > 0) {
        const current = stack.pop();
        if (current === undefined) continue;
        for (const child of childrenByParent.get(current) ?? []) {
          remove.add(child);
          stack.push(child);
        }
      }
      localStore.setQuery(
        api.wiki.listTree,
        { teamId },
        tree.filter((node) => !remove.has(node._id)),
      );
      const open = localStore.getQuery(api.wiki.getNode, { id: args.id });
      if (open) {
        localStore.setQuery(api.wiki.getNode, { id: args.id }, null);
      }
    },
  );

  const [renameTarget, setRenameTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );

  const handleCreateInFolder = useCallback(
    async (parentId: Id<"wikiNodes">, kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId, kind, title, teamId });
      if (kind === "document") {
        onSelect(newId);
      }
    },
    [createNode, onSelect],
  );

  return (
    <div className="flex flex-col min-h-0 flex-1 w-full">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted">
            No documents yet. Use Add below to create one.
          </p>
        ) : (
          <TreeList
            nodes={tree}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            selectionMode={selectionMode}
            selectedNodeIds={selectedNodeIds}
            onToggleSelect={onToggleSelect}
            onCreateInside={handleCreateInFolder}
            onRequestRename={setRenameTarget}
            onRequestDelete={setDeleteTarget}
          />
        )}
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

interface TreeListProps {
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

function TreeList({
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
}: TreeListProps) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((item) => (
        <TreeItem
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

interface TreeItemProps {
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

function TreeItem({
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
}: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isFolder = item.node.kind === "folder";
  const isChecked = selectedNodeIds?.has(item.node._id) ?? false;
  const highlighted = selectionMode ? isChecked : selectedId === item.node._id;

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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={handleActivate}
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-[background-color,color]",
              highlighted
                ? "bg-surface-tertiary font-medium text-foreground"
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
          </button>
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

      {isFolder && expanded && item.children.length > 0 ? (
        <div className="ml-[15px] border-l border-separator pl-2">
          <TreeList
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
