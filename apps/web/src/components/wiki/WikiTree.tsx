import { useState } from "react";
import { useMutation } from "convex/react";
import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { AssistiveTreeDescription, useTree } from "@headless-tree/react";
import { api, type Id } from "@vmem/backend";
import type { WikiListNode, WikiNodeId } from "./-types";
import {
  collectSubtreeIds,
  compareWikiTreeSiblings,
  resolveWikiMove,
  WIKI_ROOT_DROP_ID,
} from "./_utils";
import RenameDialog from "./RenameDialog";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { WikiTreeRow } from "./WikiTreeItem";
import { useActiveTeamId } from "@/components/workspace/active-profile";
import { cn } from "@vmem/ui";

type WikiTreeMode = "navigate" | "bulk-select";

type WikiTreeItemData =
  | WikiListNode
  | {
      __root: true;
    };

function isRootData(data: WikiTreeItemData): data is { __root: true } {
  return "__root" in data;
}

interface WikiTreeProps {
  // flat node list from listTree
  nodes: Array<WikiListNode>;
  selectedId: string | null;
  onSelect: (id: WikiNodeId | "") => void;
  // navigate = open node; bulk-select = checkbox toggle
  mode?: WikiTreeMode;
  selectedNodeIds?: ReadonlySet<WikiNodeId>;
  onToggleSelect?: (id: WikiNodeId) => void;
}

// left-pane document/folder tree
export default function WikiTree({
  nodes,
  selectedId,
  onSelect,
  mode = "navigate",
  selectedNodeIds,
  onToggleSelect,
}: WikiTreeProps) {
  const teamId = useActiveTeamId();
  const createNode = useMutation(api.wiki.createNode).withOptimisticUpdate(
    (localStore, args) => {
      const listArgs = { teamId: args.teamId };
      const list = localStore.getQuery(api.wiki.listTree, listArgs);
      if (list === undefined) return;
      const now = Date.now();
      const siblings = list.filter(
        (n) => (n.parentId ?? undefined) === (args.parentId ?? undefined),
      );
      const order =
        siblings.length === 0
          ? 0
          : Math.max(...siblings.map((s) => s.order)) + 1;
      const tempId = crypto.randomUUID() as Id<"wikiNodes">;
      localStore.setQuery(api.wiki.listTree, listArgs, [
        ...list,
        {
          _id: tempId,
          _creationTime: now,
          userId: list[0]?.userId ?? ("" as Id<"users">),
          teamId: args.teamId,
          parentId: args.parentId,
          kind: args.kind,
          title: args.title,
          language: args.language,
          order,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    },
  );
  const renameNode = useMutation(api.wiki.renameNode).withOptimisticUpdate(
    (localStore, args) => {
      for (const entry of localStore.getAllQueries(api.wiki.listTree)) {
        if (entry.value === undefined) continue;
        localStore.setQuery(
          api.wiki.listTree,
          entry.args,
          entry.value.map((n) =>
            n._id === args.id ? { ...n, title: args.title } : n,
          ),
        );
      }
      for (const entry of localStore.getAllQueries(api.wiki.getNode)) {
        if (entry.value == null || entry.value._id !== args.id) continue;
        localStore.setQuery(api.wiki.getNode, entry.args, {
          ...entry.value,
          title: args.title,
        });
      }
    },
  );
  const deleteNode = useMutation(api.wiki.deleteNode).withOptimisticUpdate(
    (localStore, args) => {
      for (const entry of localStore.getAllQueries(api.wiki.listTree)) {
        if (entry.value === undefined) continue;
        const remove = collectSubtreeIds(entry.value, [args.id]);
        localStore.setQuery(
          api.wiki.listTree,
          entry.args,
          entry.value.filter((n) => !remove.has(n._id)),
        );
      }
      for (const entry of localStore.getAllQueries(api.wiki.getNode)) {
        if (entry.args.id === args.id) {
          localStore.setQuery(api.wiki.getNode, entry.args, undefined);
        }
      }
    },
  );
  const moveNode = useMutation(api.wiki.moveNode).withOptimisticUpdate(
    (localStore, args) => {
      for (const entry of localStore.getAllQueries(api.wiki.listTree)) {
        if (entry.value === undefined) continue;
        localStore.setQuery(
          api.wiki.listTree,
          entry.args,
          entry.value.map((n) =>
            n._id === args.id
              ? {
                  ...n,
                  parentId: args.newParentId,
                  order: args.newOrder,
                }
              : n,
          ),
        );
      }
    },
  );

  const [renameTarget, setRenameTarget] = useState<WikiListNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WikiListNode | null>(null);

  const byId = (() => {
    const map = new Map<string, WikiListNode>();
    for (const node of nodes) {
      map.set(node._id, node);
    }
    return map;
  })();

  const childrenByParent = (() => {
    const map = new Map<string, string[]>();
    const sorted = [...nodes].sort(compareWikiTreeSiblings);
    for (const node of sorted) {
      const key = node.parentId ?? WIKI_ROOT_DROP_ID;
      const list = map.get(key) ?? [];
      list.push(node._id);
      map.set(key, list);
    }
    return map;
  })();

  const rootFolderIds = nodes
    .filter((node) => node.kind === "folder" && node.parentId === undefined)
    .map((node) => node._id);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [seenRootFolderIds, setSeenRootFolderIds] = useState<string[]>([]);

  // expand newly appeared root folders (query load / create) without useEffect
  const rootFoldersChanged =
    rootFolderIds.length !== seenRootFolderIds.length ||
    rootFolderIds.some((id, index) => id !== seenRootFolderIds[index]);
  if (rootFoldersChanged) {
    const previouslySeen = new Set(seenRootFolderIds);
    const newlyAppeared = rootFolderIds.filter((id) => !previouslySeen.has(id));
    if (newlyAppeared.length > 0) {
      setExpandedItems((prev) => [...new Set([...prev, ...newlyAppeared])]);
    }
    setSeenRootFolderIds(rootFolderIds);
  }

  const isBulkSelect = mode === "bulk-select";

  const handleCreateInFolder = async (
    parentId: WikiNodeId,
    kind: "folder" | "document" | "artifact",
  ) => {
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
  };

  const tree = useTree<WikiTreeItemData>({
    rootItemId: WIKI_ROOT_DROP_ID,
    indent: 16,
    // reorder lines are how we expose "drop to root"; order itself stays append-only via resolveWikiMove
    canReorder: true,
    state: {
      expandedItems,
      selectedItems:
        !isBulkSelect && selectedId !== null && selectedId.length > 0
          ? [selectedId]
          : [],
    },
    setExpandedItems,
    setSelectedItems: () => {
      // navigate selection is owned by the route (selectedId), not the tree
    },
    getItemName: (item) => {
      const data = item.getItemData();
      if (isRootData(data)) return "Wiki";
      return data.title;
    },
    isItemFolder: (item) => {
      const data = item.getItemData();
      if (isRootData(data)) return true;
      return data.kind === "folder";
    },
    dataLoader: {
      getItem: (itemId) => {
        if (itemId === WIKI_ROOT_DROP_ID) {
          return { __root: true };
        }
        const node = byId.get(itemId);
        if (node === undefined) {
          return { __root: true };
        }
        return node;
      },
      getChildren: (itemId) => childrenByParent.get(itemId) ?? [],
    },
    canDrag: () => !isBulkSelect,
    canDrop: (items, target) => {
      if (isBulkSelect) return false;
      // target.item is the new parent (folder, or root when dropping between top-level rows)
      if (!target.item.isFolder()) return false;
      const dragged = items[0];
      if (dragged === undefined) return false;
      const overId = target.item.getId();
      if (overId === WIKI_ROOT_DROP_ID) return true;
      const subtree = collectSubtreeIds(nodes, [dragged.getId()]);
      return !subtree.has(overId);
    },
    onDrop: (items, target) => {
      const dragged = items[0];
      if (dragged === undefined) return;
      const overId = target.item.getId();
      const move = resolveWikiMove(
        nodes,
        dragged.getId(),
        overId === WIKI_ROOT_DROP_ID ? WIKI_ROOT_DROP_ID : overId,
      );
      if (move) void moveNode(move);
    },
    onPrimaryAction: (item) => {
      const data = item.getItemData();
      if (isRootData(data)) return;

      if (isBulkSelect) {
        onToggleSelect?.(data._id);
        return;
      }

      if (data.kind === "folder") {
        if (item.isExpanded()) {
          item.collapse();
        } else {
          item.expand();
        }
        return;
      }

      onSelect(data._id);
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
    ],
  });

  // sync internal flatten when Convex listTree updates (runs on next getItems)
  tree.scheduleRebuildTree();

  const draggedItems = tree.getState().dnd?.draggedItems;
  const draggedIds = new Set(
    draggedItems === undefined ? [] : draggedItems.map((item) => item.getId()),
  );
  const dragTarget = tree.getDragTarget();
  const rootIsDropTarget =
    !isBulkSelect &&
    dragTarget !== null &&
    dragTarget.item.getId() === WIKI_ROOT_DROP_ID;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {nodes.length === 0 ? (
        <p className="px-2 py-3 text-xs text-muted">
          No documents yet. Use Add below to create one.
        </p>
      ) : (
        <div
          {...tree.getContainerProps()}
          className={cn(
            "relative min-h-0 flex-1 overflow-y-auto scrollbar-thin rounded-md transition-[background-color]",
            rootIsDropTarget ? "bg-surface-secondary/40" : null,
          )}
        >
          <AssistiveTreeDescription tree={tree} />
          <div className="flex flex-col gap-0.5">
            {tree.getItems().map((item) => {
              const data = item.getItemData();
              if (isRootData(data)) return null;

              const isFolder = data.kind === "folder";
              const highlighted = isBulkSelect
                ? (selectedNodeIds?.has(data._id) ?? false)
                : selectedId === data._id;
              const level = Math.max(0, item.getItemMeta().level - 1);

              return (
                <div
                  key={item.getId()}
                  className={cn(
                    "rounded-md transition-[background-color]",
                    !isBulkSelect && item.isUnorderedDragTarget()
                      ? "bg-surface-tertiary ring-1 ring-primary"
                      : null,
                  )}
                  style={{ marginLeft: level * 16 }}
                >
                  <WikiTreeRow
                    node={data}
                    isFolder={isFolder}
                    expanded={item.isExpanded()}
                    highlighted={highlighted}
                    isBulkSelect={isBulkSelect}
                    isChecked={selectedNodeIds?.has(data._id) ?? false}
                    isDragging={draggedIds.has(item.getId())}
                    itemProps={item.getProps()}
                    onToggleExpanded={(e) => {
                      e.stopPropagation();
                      if (item.isExpanded()) {
                        item.collapse();
                      } else {
                        item.expand();
                      }
                    }}
                    onCreateInside={handleCreateInFolder}
                    onRequestRename={setRenameTarget}
                    onRequestDelete={setDeleteTarget}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={tree.getDragLineStyle()}
            className="pointer-events-none absolute h-0.5 bg-primary"
          />
        </div>
      )}

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
