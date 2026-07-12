"use client";

import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@vmem/backend";
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
  Checkbox,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  cn,
} from "@vmem/ui";
import type { WikiTreeNode } from "./_utils";
import { resolveWikiMove, WIKI_ROOT_DROP_ID } from "./_utils";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { optimisticId } from "@/lib/optimisticId";
import { useActiveTeamId } from "@/components/workspace/active-profile";

/**
 * Collision strategy: a folder row always wins over the surrounding root
 * droppable. `pointerWithin` returns every droppable under the cursor (the row
 * and the root container both qualify); we drop the root candidate whenever a
 * real node is also under the pointer so dropping on a folder nests into it,
 * and only empty space resolves to the root.
 */
const wikiCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const nonRoot = collisions.filter((c) => c.id !== WIKI_ROOT_DROP_ID);
  return nonRoot.length > 0 ? nonRoot : collisions;
};

interface WikiTreeProps {
  tree: WikiTreeNode[];
  /** Flat node list (the raw `listTree` result) for drag-and-drop move math. */
  nodes: Array<Doc<"wikiNodes">>;
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
  nodes,
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
      const head = tree.at(0);
      if (!head) return;
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
        userId: head.userId,
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

  // Drag-to-move: patch the node's parentId + order in the cached listTree so
  // the tree reorganises instantly while the server round-trips.
  const moveNode = useMutation(api.wiki.moveNode).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
      if (!tree) return;
      localStore.setQuery(
        api.wiki.listTree,
        { teamId },
        tree.map((node) =>
          node._id === args.id
            ? {
                ...node,
                parentId: args.newParentId,
                order: args.newOrder,
                updatedAt: Date.now(),
              }
            : node,
        ),
      );
    },
  );

  const [renameTarget, setRenameTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Doc<"wikiNodes"> | null>(
    null,
  );

  // The node currently being dragged — drives the drag overlay preview.
  const [activeNode, setActiveNode] = useState<Doc<"wikiNodes"> | null>(null);

  // 5px threshold so a plain click (open doc / toggle folder) and the
  // right-click context menu still work; a drag only begins after movement.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setActiveNode(nodes.find((n) => n._id === event.active.id) ?? null);
    },
    [nodes],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveNode(null);
      const activeId =
        typeof event.active.id === "string" ? event.active.id : undefined;
      const overId =
        typeof event.over?.id === "string" ? event.over.id : undefined;
      if (activeId === undefined) return;
      const move = resolveWikiMove(nodes, activeId, overId);
      if (move) void moveNode(move);
    },
    [nodes, moveNode],
  );

  const handleCreateInFolder = useCallback(
    async (parentId: Id<"wikiNodes">, kind: "folder" | "document") => {
      const title = kind === "folder" ? "Untitled folder" : "Untitled";
      const newId = await createNode({ parentId, kind, title, teamId });
      if (kind === "document") {
        onSelect(newId);
      }
    },
    [createNode, onSelect, teamId],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={wikiCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveNode(null)}
    >
      <div className="flex flex-col min-h-0 flex-1 w-full">
        <RootDropZone disabled={selectionMode}>
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
        </RootDropZone>

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

      <DragOverlay dropAnimation={null}>
        {activeNode ? <DragPreview node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Scroll container that doubles as the "move to top level" drop target. Lives in
 * its own component so `useDroppable` runs inside the `DndContext` provider
 * (a hook called in the same component that renders the context can't see it).
 */
function RootDropZone({
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
        // isOver is only set during an active drag, so this is the drop hint.
        isOver ? "bg-surface-secondary/40" : null,
      )}
    >
      {children}
    </div>
  );
}

/** Floating preview rendered under the cursor while dragging a row. */
function DragPreview({ node }: { node: Doc<"wikiNodes"> }) {
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

  // The row is draggable; folders are also a drop target to nest into.
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
          // Highlight the folder being hovered as a drop target.
          isOver && "bg-surface-tertiary ring-1 ring-primary",
        )}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              type="button"
              ref={setDragRef}
              onClick={handleActivate}
              style={{
                transform: CSS.Translate.toString(transform),
                opacity: isDragging ? 0.4 : undefined,
              }}
              {...attributes}
              {...listeners}
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
      </div>

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
