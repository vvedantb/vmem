"use client";

import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@vmem/ui";
import { IconBrandGithub, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

type GitHubConnection = FunctionReturnType<typeof api.github.getConnection>;

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
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (connection === undefined) {
    return null;
  }

  if (connection) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disconnecting}
        onClick={async () => {
          setDisconnecting(true);
          try {
            await disconnectGithub();
            toast.success("GitHub disconnected");
          } catch {
            toast.error("Failed to disconnect");
          } finally {
            setDisconnecting(false);
          }
        }}
        className="border-border text-muted"
      >
        {disconnecting ? (
          <IconLoader2 size={14} className="animate-spin" />
        ) : null}
        {disconnecting ? "Disconnecting..." : "Disconnect"}
      </Button>
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
      className="bg-surface-tertiary text-accent-foreground font-medium"
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
