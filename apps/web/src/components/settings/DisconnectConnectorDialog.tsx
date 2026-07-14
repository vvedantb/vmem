"use client";

import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { toast } from "sonner";
import DestructiveConfirmDialog from "./DestructiveConfirmDialog";
import { optimisticallyDisconnectConnector } from "./_optimisticConnectors";

interface DisconnectConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  connectorId: Id<"connectors">;
  connectorName: string;
}

export default function DisconnectConnectorDialog({
  open,
  onClose,
  connectorId,
  connectorName,
}: DisconnectConnectorDialogProps) {
  const disconnectOAuth = useAction(api.connectors.oauth.disconnect);
  const markDisconnected = useMutation(
    api.connectors.crud.disconnect,
  ).withOptimisticUpdate((localStore, args) => {
    optimisticallyDisconnectConnector(localStore, args.id);
  });
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await Promise.all([
        markDisconnected({ id: connectorId }),
        disconnectOAuth({ connectorId }),
      ]);
      toast(`Disconnected from ${connectorName}`);
      onClose();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DestructiveConfirmDialog
      open={open}
      onClose={onClose}
      title={`Disconnect ${connectorName}?`}
      description={`vmem will stop syncing from ${connectorName} and revoke access until you connect again. Memories already imported stay in your graph unless you delete them separately.`}
      confirmLabel="Disconnect"
      submittingLabel="Disconnecting…"
      submitting={submitting}
      onConfirm={() => void handleConfirm()}
    />
  );
}
