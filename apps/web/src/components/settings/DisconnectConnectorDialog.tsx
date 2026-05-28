"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@vmem/backend";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vmem/ui";
import { IconLoader2 } from "@tabler/icons-react";
import { toast } from "sonner";

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
  const disconnect = useAction(api.connectors.oauth.disconnect);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await disconnect({ connectorId });
      toast(`Disconnected from ${connectorName}`);
      onClose();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect {connectorName}?</DialogTitle>
          <DialogDescription>
            vmem will stop syncing from {connectorName} and revoke access until
            you connect again. Memories already imported stay in your graph
            unless you delete them separately.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting ? (
              <IconLoader2 size={14} className="animate-spin" />
            ) : null}
            {submitting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
