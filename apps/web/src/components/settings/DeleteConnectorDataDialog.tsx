"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@vmem/backend";
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

interface DeleteConnectorDataDialogProps {
  open: boolean;
  onClose: () => void;
  connectorId: Id<"connectors">;
  connectorName: string;
}

function confirmPhraseForConnector(name: string): string {
  return `delete ${name}`.toLowerCase();
}

export default function DeleteConnectorDataDialog({
  open,
  onClose,
  connectorId,
  connectorName,
}: DeleteConnectorDataDialogProps) {
  const deleteData = useAction(api.connectors.crud.deleteConnectorData);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirmPhrase = confirmPhraseForConnector(connectorName);
  const canConfirm = confirmText.trim().toLowerCase() === confirmPhrase;

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const deleted = await deleteData({ connectorId });
      toast.success(
        deleted === 1
          ? `Removed 1 memory imported from ${connectorName}.`
          : `Removed ${String(deleted)} memories imported from ${connectorName}.`,
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete connector data",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {connectorName} data?</DialogTitle>
          <DialogDescription>
            All memories imported from {connectorName} will be permanently
            removed from your graph. Your OAuth connection stays active — use
            Disconnect to revoke access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-connector-confirm" className="text-sm">
            Type{" "}
            <span className="font-mono text-foreground">{confirmPhrase}</span>{" "}
            to confirm
          </Label>
          <Input
            id="delete-connector-confirm"
            autoComplete="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            placeholder={confirmPhrase}
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
            {submitting ? "Deleting…" : "Delete imported data"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
