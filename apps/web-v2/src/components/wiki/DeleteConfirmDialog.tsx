"use client";

import { useState } from "react";
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

interface DeleteConfirmDialogProps {
  target: Doc<"wikiNodes"> | null;
  onClose: () => void;
  onConfirm: (id: Id<"wikiNodes">) => Promise<void>;
}

/**
 * Confirms deletion of a folder or document. Folders warn about recursive
 * deletion of all children.
 */
export default function DeleteConfirmDialog({
  target,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!target) return;
    setSubmitting(true);
    try {
      await onConfirm(target._id);
    } finally {
      setSubmitting(false);
    }
  };

  const isFolder = target?.kind === "folder";

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {isFolder ? "folder" : "document"}?</DialogTitle>
          <DialogDescription>
            {isFolder
              ? `"${target?.title}" and everything inside it will be permanently removed.`
              : `"${target?.title}" will be permanently removed.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
