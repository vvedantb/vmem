"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Doc, Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { collectSubtreeIds } from "./_utils";

interface WikiBulkDeleteBarProps {
  selectedIds: ReadonlySet<Id<"wikiNodes">>;
  nodes: Array<Doc<"wikiNodes">>;
  teamId: Id<"teams"> | undefined;
  /** Open document, so we can navigate away if the selection deletes it. */
  currentDocId: string | null;
  /** Clear the selection and leave select mode. */
  onExit: () => void;
  /** Called when the open document was among those deleted. */
  onCurrentRemoved: () => void;
}

/**
 * Selection-mode action bar for the wiki tree: shows the selected count and a
 * confirm-gated bulk delete. Folders delete their whole subtree (the server
 * dedupes overlapping folder/child selections).
 */
export function WikiBulkDeleteBar({
  selectedIds,
  nodes,
  teamId,
  currentDocId,
  onExit,
  onCurrentRemoved,
}: WikiBulkDeleteBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleDelete = async () => {
    if (count === 0) return;
    const ids = [...selectedIds];
    const removeSet = collectSubtreeIds(nodes, ids);
    setDeleting(true);
    try {
      await deleteNodes({ ids });
      toast.success(`Deleted ${count} ${count === 1 ? "item" : "items"}`);
      if (currentDocId !== null && removeSet.has(currentDocId)) {
        onCurrentRemoved();
      }
      setConfirmOpen(false);
      onExit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const itemWord = count === 1 ? "item" : "items";

  return (
    <>
      <div className="flex items-center gap-1 rounded-md bg-surface-secondary/60 px-2 py-1">
        <span className="text-xs font-medium tabular-nums text-foreground">
          {count} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-danger hover:text-danger"
          disabled={count === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <IconTrash size={14} />
          Delete
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted"
          aria-label="Cancel selection"
          onClick={onExit}
        >
          <IconX size={14} />
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {count} {itemWord}?
            </DialogTitle>
            <DialogDescription>
              The selected documents and folders will be permanently removed,
              including everything inside any selected folder. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
