"use client";

import { KeyConfirmDialog } from "./KeyConfirmDialog";

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
    <KeyConfirmDialog
      isOpen={isOpen}
      isBusy={isDeleting}
      title="Delete API Key"
      detail="This removes the key from your account. Active keys stop working immediately. This cannot be undone."
      confirmLabel="Delete Key"
      busyLabel="Deleting..."
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      Delete <span className="font-medium">{keyName}</span> permanently?
    </KeyConfirmDialog>
  );
}
