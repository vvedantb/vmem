import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

type RemoveMemberDialogProps = {
  open: boolean;
  memberLabel: string;
  teamName: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function RemoveMemberDialog({
  open,
  memberLabel,
  teamName,
  submitting,
  onClose,
  onConfirm,
}: RemoveMemberDialogProps) {
  return (
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title={`Remove ${memberLabel}?`}
      description={`They will lose access to ${teamName} and its shared memories.`}
      confirmLabel="Remove member"
      submittingLabel="Removing…"
      submitting={submitting}
      onConfirm={onConfirm}
    />
  );
}
