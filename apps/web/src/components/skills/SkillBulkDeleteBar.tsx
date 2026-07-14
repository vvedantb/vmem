"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { Id } from "@vmem/backend";
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

interface SkillBulkDeleteBarProps {
  selectedIds: ReadonlySet<Id<"skills">>;
  teamId: Id<"teams"> | undefined;
  // clear the selection and leave select mode
  onExit: () => void;
}

// selection-mode action bar for the skills sidebar: selected count plus a confirm-gated bulk delete
export function SkillBulkDeleteBar({
  selectedIds,
  teamId,
  onExit,
}: SkillBulkDeleteBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteSkills = useMutation(
    api.skills.deleteSkills,
  ).withOptimisticUpdate((localStore, args) => {
    const current = localStore.getQuery(api.skills.listMy, { teamId });
    if (!current) return;
    const removeSet = new Set(args.ids);
    localStore.setQuery(
      api.skills.listMy,
      { teamId },
      current.filter((skill) => !removeSet.has(skill._id)),
    );
  });

  const count = selectedIds.size;
  const itemWord = count === 1 ? "skill" : "skills";

  const handleDelete = async () => {
    if (count === 0) return;
    setDeleting(true);
    try {
      await deleteSkills({ ids: [...selectedIds] });
      toast.success(`Deleted ${count} ${itemWord}`);
      setConfirmOpen(false);
      onExit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

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
              The selected skills will be permanently removed. This cannot be
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
