import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
import type { WikiListNode, WikiNodeId } from "./-types";
import { toast } from "sonner";
import { BulkSelectionDeleteBar } from "@/components/BulkSelectionDeleteBar";
import { collectSubtreeIds } from "./_utils";

interface WikiBulkDeleteBarProps {
  selectedIds: ReadonlySet<WikiNodeId>;
  nodes: Array<WikiListNode>;
  teamId: Id<"teams"> | undefined;
  // open document, so we can navigate away if the selection deletes it
  currentDocId: string | null;
  // clear the selection and leave select mode
  onExit: () => void;
  // called when the open document was among those deleted
  onCurrentRemoved: () => void;
}

// selection-mode action bar for the wiki tree
export function WikiBulkDeleteBar({
  selectedIds,
  nodes,
  teamId,
  currentDocId,
  onExit,
  onCurrentRemoved,
}: WikiBulkDeleteBarProps) {
  const deleteNodes = useMutation(api.wiki.deleteNodes).withOptimisticUpdate(
    (localStore, args) => {
      const tree = localStore.getQuery(api.wiki.listTree, { teamId });
      if (!tree) return;
      const removeSet = collectSubtreeIds(tree, args.ids);
      localStore.setQuery(
        api.wiki.listTree,
        { teamId },
        tree.filter((node) => !removeSet.has(node._id)),
      );
    },
  );

  const count = selectedIds.size;
  const itemWord = count === 1 ? "item" : "items";

  return (
    <BulkSelectionDeleteBar
      count={count}
      itemWord={itemWord}
      description="The selected documents and folders will be permanently removed, including everything inside any selected folder. This cannot be undone."
      onExit={onExit}
      onDelete={async () => {
        if (count === 0) return;
        const ids = [...selectedIds];
        const removeSet = collectSubtreeIds(nodes, ids);
        try {
          await deleteNodes({ ids });
          toast.success(`Deleted ${count} ${itemWord}`);
          if (currentDocId !== null && removeSet.has(currentDocId)) {
            onCurrentRemoved();
          }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed to delete");
          throw err;
        }
      }}
    />
  );
}
