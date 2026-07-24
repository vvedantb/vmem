import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { toast } from "sonner";
import DestructiveConfirmDialog from "./DestructiveConfirmDialog";

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
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
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
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title={`Delete ${connectorName} data?`}
      description={`All memories imported from ${connectorName} will be permanently removed from your graph. Your OAuth connection stays active — use Disconnect to revoke access.`}
      confirmLabel="Delete imported data"
      submittingLabel="Deleting…"
      submitting={submitting}
      onConfirm={() => void handleConfirm()}
      confirmPhrase={confirmPhraseForConnector(connectorName)}
    />
  );
}
