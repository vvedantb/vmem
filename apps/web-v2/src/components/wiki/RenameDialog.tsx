"use client";

import { useEffect, useState } from "react";
import type { Doc, Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";

interface RenameDialogProps {
  target: Doc<"wikiNodes"> | null;
  onClose: () => void;
  onConfirm: (id: Id<"wikiNodes">, title: string) => Promise<void>;
}

/**
 * Shared rename dialog for folders + documents. Controlled by `target` —
 * null closes, a node opens. Resets the input whenever target changes.
 */
export default function RenameDialog({
  target,
  onClose,
  onConfirm,
}: RenameDialogProps) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setTitle(target?.title ?? "");
  }, [target]);

  const handleSubmit = async () => {
    if (!target) return;
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === target.title) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm(target._id, trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Rename {target?.kind === "folder" ? "folder" : "document"}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Title"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
