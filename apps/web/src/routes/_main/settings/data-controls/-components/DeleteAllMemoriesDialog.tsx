"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@vmem/ui";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONFIRM_PHRASE = "delete all memories";

// type-to-confirm dialog for the wipe-all action
export default function DeleteAllMemoriesDialog({ open, onClose }: Props) {
  const deleteAll = useAction(api.memoryApi.deleteAllMemories);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const canConfirm = confirmText.trim().toLowerCase() === CONFIRM_PHRASE;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const deleted = await deleteAll();
      toast.success(
        deleted === 1
          ? "Deleted 1 memory and all related data."
          : `Deleted ${String(deleted)} memories and all related data.`,
      );
      onClose();
    } catch {
      toast.error("Couldn't delete your memories. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete all memories?</DialogTitle>
          <DialogDescription>
            Every memory you own will be permanently removed, along with their
            tags, relationships, chunks, and history. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-all-confirm" className="text-sm">
            Type{" "}
            <span className="font-mono text-foreground">{CONFIRM_PHRASE}</span>{" "}
            to confirm
          </Label>
          <Input
            id="delete-all-confirm"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            placeholder={CONFIRM_PHRASE}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm || submitting}
          >
            {submitting ? "Deleting…" : "Delete everything"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
