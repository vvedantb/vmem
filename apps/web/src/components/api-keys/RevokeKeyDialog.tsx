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

interface RevokeKeyDialogProps {
  keyName: string | undefined;
  isOpen: boolean;
  isRevoking: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RevokeKeyDialog({
  keyName,
  isOpen,
  isRevoking,
  onConfirm,
  onCancel,
}: RevokeKeyDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isRevoking) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-sm bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Revoke API Key</DialogTitle>
          <DialogDescription className="sr-only">
            Confirm revoking an API key
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 py-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <IconAlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <p className="text-foreground">
              Are you sure you want to revoke{" "}
              <span className="font-medium">{keyName}</span>?
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              This action cannot be undone. Any applications using this key will
              immediately lose access.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isRevoking}
            className="text-muted-foreground"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isRevoking}
            className="bg-destructive text-primary-foreground"
          >
            {isRevoking ? (
              <>
                <IconLoader2 size={16} className="animate-spin" />
                Revoking...
              </>
            ) : (
              "Revoke Key"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
