"use client";

import { useAction, useMutation } from "convex/react";
import { api } from "@vmem/backend";
import { Button } from "@vmem/ui";
import { IconBrandGithub, IconCheck, IconLoader2 } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";

type Connection = FunctionReturnType<typeof api.github.getConnection>;

interface ConnectGitHubButtonProps {
  connection: Connection;
}

export function ConnectGitHubButton({ connection }: ConnectGitHubButtonProps) {
  const disconnectGithub = useMutation(api.github.disconnect);
  const startOAuth = useAction(api.github.startGitHubOAuth);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  if (connection) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <IconCheck size={14} className="text-emerald-500" />
          <span>{connection.githubUsername}</span>
        </div>
        <Button
          variant="ghost"
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
        >
          {disconnecting ? (
            <IconLoader2 size={14} className="animate-spin" />
          ) : (
            "Disconnect"
          )}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={connecting}
      onClick={async () => {
        setConnecting(true);
        try {
          const url = await startOAuth({
            returnUrl: window.location.origin,
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
      Connect GitHub
    </Button>
  );
}
