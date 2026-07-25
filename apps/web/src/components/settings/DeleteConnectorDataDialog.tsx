import { useAction } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { toast } from "sonner";
import DestructiveConfirmDialog from "./DestructiveConfirmDialog";
import { useAsyncSubmit } from "@/hooks/useAsyncSubmit";

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
  const { submitting, run } = useAsyncSubmit();

  const handleConfirm = async () => {
    await run(async () => {
      const deleted = await deleteData({ connectorId });
      toast.success(
        deleted === 1
          ? `Removed 1 memory imported from ${connectorName}.`
          : `Removed ${String(deleted)} memories imported from ${connectorName}.`,
      );
      onClose();
    }, "Failed to delete connector data");
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
