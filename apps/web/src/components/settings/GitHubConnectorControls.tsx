"use client";

import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBrandGithub, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import type { GitHubConnection } from "./connector-utils";
import DestructiveConfirmDialog from "./DestructiveConfirmDialog";

interface GitHubConnectorControlsProps {
  connection: GitHubConnection | undefined;
  returnPath?: string;
}

export function GitHubConnectorControls({
  connection,
  returnPath = "/settings/connectors",
}: GitHubConnectorControlsProps) {
  const disconnectGithub = useMutation(
    api.github.disconnect,
  ).withOptimisticUpdate((localStore) => {
    localStore.setQuery(api.github.getConnection, {}, null);
  });
  const startOAuth = useAction(api.github.startGitHubOAuth);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (connection === undefined) {
    return null;
  }

  if (connection) {
    const handleConfirmDisconnect = async () => {
      setDisconnecting(true);
      try {
        await disconnectGithub();
        toast.success("GitHub disconnected");
        setConfirmDisconnectOpen(false);
      } catch {
        toast.error("Failed to disconnect");
      } finally {
        setDisconnecting(false);
      }
    };

    return (
      <>
        <Button
          variant="destructive"
          size="sm"
          disabled={disconnecting}
          onClick={() => setConfirmDisconnectOpen(true)}
        >
          Disconnect
        </Button>

        <DestructiveConfirmDialog
          open={confirmDisconnectOpen}
          onClose={() => setConfirmDisconnectOpen(false)}
          title="Disconnect GitHub?"
          description="vmem will revoke GitHub access and stop syncing repositories until you connect again. Codebases and memories already imported stay unless you remove them separately."
          confirmLabel="Disconnect"
          submittingLabel="Disconnecting…"
          submitting={disconnecting}
          onConfirm={() => void handleConfirmDisconnect()}
        />
      </>
    );
  }

  return (
    <Button
      size="sm"
      disabled={connecting}
      onClick={async () => {
        setConnecting(true);
        try {
          const url = await startOAuth({
            returnUrl: `${window.location.origin}${returnPath}`,
          });
          window.location.href = url;
        } catch {
          toast.error("Failed to start GitHub connection");
          setConnecting(false);
        }
      }}
    >
      {connecting ? (
        <IconLoader2 size={14} className="animate-spin" />
      ) : (
        <IconBrandGithub size={16} />
      )}
      {connecting ? "Connecting..." : "Connect"}
    </Button>
  );
}
