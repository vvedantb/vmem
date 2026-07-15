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

function GitHubDisconnectControl({
  onDisconnect,
  disconnecting,
}: {
  onDisconnect: () => Promise<boolean>;
  disconnecting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirm = async () => {
    const ok = await onDisconnect();
    if (ok) setConfirmOpen(false);
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        disabled={disconnecting}
        onClick={() => setConfirmOpen(true)}
      >
        Disconnect
      </Button>

      <DestructiveConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Disconnect GitHub?"
        description="vmem will revoke GitHub access and stop syncing repositories until you connect again. Codebases and memories already imported stay unless you remove them separately."
        confirmLabel="Disconnect"
        submittingLabel="Disconnecting…"
        submitting={disconnecting}
        onConfirm={() => void handleConfirm()}
      />
    </>
  );
}

function GitHubConnectControl({ returnPath }: { returnPath: string }) {
  const startOAuth = useAction(api.github.startGitHubOAuth);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
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
  };

  return (
    <Button
      size="sm"
      disabled={connecting}
      onClick={() => void handleConnect()}
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

export function GitHubConnectorControls({
  connection,
  returnPath = "/settings/connectors",
}: GitHubConnectorControlsProps) {
  const disconnectGithub = useMutation(
    api.github.disconnect,
  ).withOptimisticUpdate((localStore) => {
    localStore.setQuery(api.github.getConnection, {}, null);
  });
  const [disconnecting, setDisconnecting] = useState(false);

  if (connection === undefined) {
    return null;
  }

  if (connection) {
    const handleDisconnect = async (): Promise<boolean> => {
      setDisconnecting(true);
      try {
        await disconnectGithub();
        toast.success("GitHub disconnected");
        return true;
      } catch {
        toast.error("Failed to disconnect");
        return false;
      } finally {
        setDisconnecting(false);
      }
    };

    return (
      <GitHubDisconnectControl
        onDisconnect={handleDisconnect}
        disconnecting={disconnecting}
      />
    );
  }

  return <GitHubConnectControl returnPath={returnPath} />;
}
