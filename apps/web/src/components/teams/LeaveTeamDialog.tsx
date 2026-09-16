import DestructiveConfirmDialog from "@/components/settings/DestructiveConfirmDialog";

type LeaveTeamDialogProps = {
  open: boolean;
  teamName: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function LeaveTeamDialog({
  open,
  teamName,
  submitting,
  onClose,
  onConfirm,
}: LeaveTeamDialogProps) {
  return (
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title={`Leave ${teamName}?`}
      description={`You'll lose access to ${teamName} and its shared memories.`}
      confirmLabel="Leave team"
      submittingLabel="Leaving…"
      submitting={submitting}
      onConfirm={onConfirm}
    />
  );
}
