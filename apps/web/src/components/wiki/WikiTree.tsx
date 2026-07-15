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
import type { WikiListNode, WikiNodeId } from "./-types";
import type { WikiTreeNode } from "./_utils";
import { resolveWikiMove, WIKI_ROOT_DROP_ID } from "./_utils";
import {
  optimisticDeleteWikiNode,
  optimisticMoveWikiNode,
  optimisticRenameWikiNode,
} from "./_optimisticMutations";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import {
  WikiDragPreview,
  WikiRootDropZone,
  WikiTreeList,
} from "./WikiTreeItem";
import { optimisticCreateWikiNode } from "./_optimisticCreate";
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
  nodes: Array<WikiListNode>;
  selectedId: string | null;
  onSelect: (id: WikiNodeId | "") => void;
  // navigate = open node; bulk-select = checkbox toggle
  mode?: "navigate" | "bulk-select";
  selectedNodeIds?: ReadonlySet<WikiNodeId>;
  onToggleSelect?: (id: WikiNodeId) => void;
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
  const teamId = useActiveTeamId();
  const createNode = useMutation(api.wiki.createNode).withOptimisticUpdate(
    optimisticCreateWikiNode,
  );
  const renameNode = useMutation(api.wiki.renameNode).withOptimisticUpdate(
    (localStore, args) => optimisticRenameWikiNode(localStore, teamId, args),
  );
  const deleteNode = useMutation(api.wiki.deleteNode).withOptimisticUpdate(
    (localStore, args) => optimisticDeleteWikiNode(localStore, teamId, args),
  );
  const moveNode = useMutation(api.wiki.moveNode).withOptimisticUpdate(
    (localStore, args) => optimisticMoveWikiNode(localStore, teamId, args),
  );

  const [renameTarget, setRenameTarget] = useState<WikiListNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WikiListNode | null>(null);

  // the node currently being dragged — drives the drag overlay preview
  const [activeNode, setActiveNode] = useState<WikiListNode | null>(null);

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
    async (parentId: WikiNodeId, kind: "folder" | "document" | "artifact") => {
      const title =
        kind === "folder"
          ? "Untitled folder"
          : kind === "artifact"
            ? "Untitled artifact"
            : "Untitled";
      const newId = await createNode({
        parentId,
        kind,
        title,
        teamId,
        language: kind === "artifact" ? "html" : undefined,
      });
      if (kind === "document" || kind === "artifact") {
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
        <WikiRootDropZone disabled={mode === "bulk-select"}>
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
              mode={mode}
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
