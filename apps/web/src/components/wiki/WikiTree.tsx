"use client";

import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import type { WikiTreeNode } from "./_utils";
import { resolveWikiMove, WIKI_ROOT_DROP_ID } from "./_utils";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import {
  WikiDragPreview,
  WikiRootDropZone,
  WikiTreeList,
} from "./WikiTreeItem";
import { optimisticId } from "@/lib/optimisticId";
import { useActiveTeamId } from "@/components/workspace/active-profile";

// collision strategy: a folder row always wins over the surrounding root droppable
const wikiCollisionDetection: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  const nonRoot = collisions.filter((c) => c.id !== WIKI_ROOT_DROP_ID);
  return nonRoot.length > 0 ? nonRoot : collisions;
};

interface WikiTreeProps {
  tree: WikiTreeNode[];
  // flat node list (the raw `listTree` result) for drag-and-drop move math
  nodes: Array<Doc<"wikiNodes">>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  // navigate = open node; bulk-select = checkbox toggle
  mode?: "navigate" | "bulk-select";
  selectedNodeIds?: ReadonlySet<Id<"wikiNodes">>;
  onToggleSelect?: (id: Id<"wikiNodes">) => void;
}

// left-pane document/folder tree
export default function WikiTree({
  tree,
  nodes,
  selectedId,
  onSelect,
  mode = "navigate",
  selectedNodeIds,
  onToggleSelect,
}: WikiTreeProps) {
  const selectionMode = mode === "bulk-select";
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

  // drag-to-move: patch the node's parentId + order in the cached listTree so
  // the tree reorganises instantly while the server round-trips
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

  // the node currently being dragged — drives the drag overlay preview
  const [activeNode, setActiveNode] = useState<Doc<"wikiNodes"> | null>(null);

  // 5px threshold so a plain click (open doc / toggle folder) and the
  // right-click context menu still work; a drag only begins after movement
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
        <WikiRootDropZone disabled={selectionMode}>
          {tree.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted">
              No documents yet. Use Add below to create one.
            </p>
          ) : (
            <WikiTreeList
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
        </WikiRootDropZone>

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
        {activeNode ? <WikiDragPreview node={activeNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
