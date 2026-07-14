"use client";

import { useState } from "react";
import type { ReactNode } from "react";
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

interface BulkSelectionDeleteBarProps {
  count: number;
  // already pluralized for the confirm title ("items", "skills")
  itemWord: string;
  description: ReactNode;
  onExit: () => void;
  onDelete: () => Promise<void>;
}

// shared selection-mode shell: count + delete/cancel + confirm dialog
export function BulkSelectionDeleteBar({
  count,
  itemWord,
  description,
  onExit,
  onDelete,
}: BulkSelectionDeleteBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (count === 0) return;
    setDeleting(true);
    try {
      await onDelete();
      setConfirmOpen(false);
      onExit();
    } catch {
      // caller owns error toasting; keep the dialog open for retry
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
            <DialogDescription>{description}</DialogDescription>
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
