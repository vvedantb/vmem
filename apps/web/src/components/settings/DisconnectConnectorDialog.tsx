import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api, type Id } from "@vmem/backend";
import { toast } from "sonner";
import DestructiveConfirmDialog from "./DestructiveConfirmDialog";

interface DisconnectConnectorDialogProps {
  open: boolean;
  onClose: () => void;
  connectorId: Id<"connectors">;
  connectorName: string;
}

export function useDisconnectConnector(
  connectorId: Id<"connectors">,
  connectorName: string,
) {
  const disconnectOAuth = useAction(api.connectors.oauth.disconnect);
  const markDisconnected = useMutation(
    api.connectors.crud.disconnect,
  ).withOptimisticUpdate((localStore, args) => {
    const list = localStore.getQuery(api.connectors.crud.listMy, {});
    if (list === undefined) return;
    localStore.setQuery(
      api.connectors.crud.listMy,
      {},
      list.map((c) =>
        c._id === args.id
          ? {
              ...c,
              connectionStatus: "disconnected" as const,
              syncStatus: "idle" as const,
              syncProgress: 0,
              itemsSynced: 0,
            }
          : c,
      ),
    );
  });
  const [submitting, setSubmitting] = useState(false);

  const disconnect = async (): Promise<boolean> => {
    setSubmitting(true);
    try {
      await Promise.all([
        markDisconnected({ id: connectorId }),
        disconnectOAuth({ connectorId }),
      ]);
      toast(`Disconnected from ${connectorName}`);
      setSubmitting(false);
      return true;
    } catch {
      toast.error("Failed to disconnect");
      setSubmitting(false);
      return false;
    }
  };

  return { disconnect, submitting };
}

export default function DisconnectConnectorDialog({
  open,
  onClose,
  connectorId,
  connectorName,
}: DisconnectConnectorDialogProps) {
  const { disconnect, submitting } = useDisconnectConnector(
    connectorId,
    connectorName,
  );

  const handleConfirm = async () => {
    const ok = await disconnect();
    if (ok) onClose();
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
