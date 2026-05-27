"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@vmem/ui";
import { IconAlertTriangle, IconLoader2 } from "@tabler/icons-react";

interface DeleteKeyDialogProps {
  keyName: string | undefined;
  isOpen: boolean;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteKeyDialog({
  keyName,
  isOpen,
  isDeleting,
  onConfirm,
  onCancel,
}: DeleteKeyDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isDeleting) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">Delete API Key</DialogTitle>
          <DialogDescription className="sr-only">
            Confirm deleting an API key
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
            <IconAlertTriangle size={20} className="text-danger" />
          </div>
          <div>
            <p className="text-foreground">
              Delete <span className="font-medium">{keyName}</span> permanently?
            </p>
            <p className="text-sm text-muted mt-1">
              This removes the key from your account. Active keys stop working
              immediately. This cannot be undone.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isDeleting}
            className="text-muted"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-danger text-danger-foreground"
          >
            {isDeleting ? (
              <>
                <IconLoader2 size={16} className="animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete Key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
