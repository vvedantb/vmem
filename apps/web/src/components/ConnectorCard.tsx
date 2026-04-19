"use client";

import { useState } from "react";
import { useAction } from "convex/react";
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
  IconClockHour4,
} from "@tabler/icons-react";
import { api, type Doc } from "@vmem/backend";
import OAuthModal from "./OAuthModal";

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
  connector: Doc<"connectors">;
}

function formatRelativeTime(timestamp: number | undefined): string {
  if (!timestamp) return "Never";

  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

export default function ConnectorCard({ connector }: ConnectorCardProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);

  const disconnectAction = useAction(api.connectorOAuth.disconnect);
  const startSyncAction = useAction(api.connectorSync.startSync);

  const Icon = iconMap[connector.icon] || IconBrandGoogleDrive;
  const isConnected = connector.connectionStatus === "connected";
  const isSyncing = connector.syncStatus === "syncing";
  const hasProvider = !!connector.provider;

  const handleConnect = () => {
    if (!hasProvider) {
      toast.info(`${connector.name} support coming soon!`);
      return;
    }
    setShowOAuthModal(true);
  };

  const handleOAuthComplete = () => {
    // Connection is handled by the OAuth callback — Convex live query updates UI
    toast.success(`Successfully connected to ${connector.name}`);
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnectAction({ connectorId: connector._id });
      toast(`Disconnected from ${connector.name}`);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSync = async () => {
    try {
      await startSyncAction({ connectorId: connector._id });
      toast(`Syncing ${connector.name}...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start sync");
    }
  };

  return (
    <>
      <Card className="bg-muted/50 shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
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
                {!hasProvider && !isConnected && (
                  <Badge className="bg-muted text-muted-foreground gap-1">
                    <IconClockHour4 size={12} stroke={2} />
                    Coming Soon
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

          <div className="mt-4 flex flex-wrap justify-end gap-2">
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
                disabled={!hasProvider}
                className={
                  hasProvider
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }
              >
                {hasProvider ? "Connect" : "Coming Soon"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {hasProvider && (
        <OAuthModal
          isOpen={showOAuthModal}
          onClose={() => setShowOAuthModal(false)}
          connectorId={connector._id}
          connectorName={connector.name}
          onComplete={handleOAuthComplete}
        />
      )}
    </>
  );
}
