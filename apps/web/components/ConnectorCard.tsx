"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, Button, Badge, Progress } from "@vmem/ui";
import { toast } from "sonner";
import {
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconBrandDropbox,
  IconBrandNotion,
  IconBrandSlack,
  IconBrandGithub,
  IconCheck,
  IconLoader2,
  IconRefresh,
  IconAlertCircle,
  IconClock,
} from "@tabler/icons-react";
import OAuthModal from "./OAuthModal";
import type { Connector } from "@/app/api/connectors/store";

const iconMap: Record<
  string,
  React.ComponentType<{ size?: number; stroke?: number; className?: string }>
> = {
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconBrandDropbox,
  IconBrandNotion,
  IconBrandSlack,
  IconBrandGithub,
};

interface ConnectorCardProps {
  connector: Connector;
  onUpdate: (connector: Connector) => void;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

export default function ConnectorCard({
  connector,
  onUpdate,
}: ConnectorCardProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const Icon = iconMap[connector.icon] || IconBrandGoogleDrive;
  const isConnected = connector.connectionStatus === "connected";
  const isSyncing = connector.syncStatus === "syncing";

  useEffect(() => {
    if (isSyncing) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/connectors/${connector.id}`);
          const data = await response.json();
          if (data.success && data.data) {
            onUpdate(data.data);
            if (data.data.syncStatus !== "syncing") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          }
        } catch {}
      }, 500);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isSyncing, connector.id, onUpdate]);

  const handleConnect = () => {
    setShowOAuthModal(true);
  };

  const handleOAuthComplete = async () => {
    setIsConnecting(true);
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });

      const data = await response.json();

      if (data.success) {
        onUpdate(data.data);
        toast.success(`Successfully connected to ${connector.name}`);
      } else {
        toast.error(data.error || "Failed to connect");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });

      const data = await response.json();

      if (data.success) {
        onUpdate(data.data);
        toast(`Disconnected from ${connector.name}`);
      } else {
        toast.error(data.error || "Failed to disconnect");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      const response = await fetch(`/api/connectors/${connector.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });

      const data = await response.json();

      if (data.success) {
        onUpdate(data.data);
        toast(`Syncing ${connector.name}...`);
      } else {
        toast.error(data.error || "Failed to start sync");
      }
    } catch {
      toast.error("An unexpected error occurred");
    }
  };

  return (
    <>
      <Card className="border border-border bg-muted/50 shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center flex-shrink-0">
              <Icon size={24} stroke={1.5} className="text-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-foreground">
                  {connector.name}
                </h3>
                {isConnected && (
                  <Badge className="bg-primary/5 dark:bg-card/10 text-muted-foreground gap-1">
                    <IconCheck size={12} stroke={2} />
                    Connected
                  </Badge>
                )}
                {isSyncing && (
                  <Badge className="bg-info/10 text-info gap-1">
                    <IconLoader2
                      size={12}
                      stroke={2}
                      className="animate-spin"
                    />
                    Syncing
                  </Badge>
                )}
                {connector.syncStatus === "error" && (
                  <Badge className="bg-destructive/10 text-destructive gap-1">
                    <IconAlertCircle size={12} stroke={2} />
                    Error
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {connector.description}
              </p>

              {isConnected && (
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <IconClock size={14} />
                    Last sync: {formatRelativeTime(connector.lastSyncAt)}
                  </span>
                  {connector.itemsSynced > 0 && (
                    <span>{connector.itemsSynced} items synced</span>
                  )}
                </div>
              )}

              {isSyncing && (
                <div className="mt-3 space-y-1">
                  <Progress
                    value={connector.syncProgress}
                    className="h-1.5 bg-muted [&>div]:bg-primary [&>div]:dark:bg-card"
                  />
                  <p className="text-xs text-muted-foreground">
                    {connector.syncProgress}% complete
                  </p>
                </div>
              )}

              {connector.errorMessage && (
                <p className="text-xs text-destructive mt-2">
                  {connector.errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {isConnected ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={isSyncing || isDisconnecting}
                  className="border-border text-muted-foreground"
                >
                  {isSyncing ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconRefresh size={14} />
                  )}
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={isSyncing || isDisconnecting}
                  className="border-border text-muted-foreground"
                >
                  {isDisconnecting && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )}
                  {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={isConnecting}
                className="bg-primary text-primary-foreground font-medium"
              >
                {isConnecting && (
                  <IconLoader2 size={14} className="animate-spin" />
                )}
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <OAuthModal
        isOpen={showOAuthModal}
        onClose={() => setShowOAuthModal(false)}
        connectorName={connector.name}
        onComplete={handleOAuthComplete}
      />
    </>
  );
}
