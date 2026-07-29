import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

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
  return (
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete ${teamName}?`}
      description="This removes the shared profile and all team memories for every member. This cannot be undone."
      confirmLabel="Delete team"
      submittingLabel="Deleting…"
      submitting={submitting}
      onConfirm={onConfirm}
      confirmPhrase={teamName}
    />
  );
}
