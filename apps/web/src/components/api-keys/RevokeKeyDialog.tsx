"use client";

import { KeyConfirmDialog } from "./KeyConfirmDialog";

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
    <KeyConfirmDialog
      isOpen={isOpen}
      isBusy={isRevoking}
      title="Revoke API Key"
      detail="This action cannot be undone. Any applications using this key will immediately lose access."
      confirmLabel="Revoke Key"
      busyLabel="Revoking..."
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      Are you sure you want to revoke{" "}
      <span className="font-medium">{keyName}</span>?
    </KeyConfirmDialog>
  );
}
