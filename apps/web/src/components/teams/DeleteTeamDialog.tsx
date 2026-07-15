import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";

type DeleteTeamDialogProps = {
  open: boolean;
  teamName: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteTeamDialog({
  open,
  teamName,
  submitting,
  onClose,
  onConfirm,
}: DeleteTeamDialogProps) {
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!open) setTypedName("");
  }, [open]);

  const nameMatches = typedName.trim() === teamName;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {teamName}?</DialogTitle>
          <DialogDescription className="sr-only">
            Delete {teamName}
          </DialogDescription>
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              This removes the shared profile and all team memories for every
              member. This cannot be undone.
            </p>
            <p className="text-foreground">
              Type <span className="font-medium">{teamName}</span> to confirm.
            </p>
            <Input
              autoFocus
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={teamName}
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nameMatches && !submitting) {
                  e.preventDefault();
                  onConfirm();
                }
              }}
            />
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={submitting || !nameMatches}
          >
            {submitting ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : null}
            {submitting ? "Deleting…" : "Delete team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
