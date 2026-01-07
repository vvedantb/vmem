"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardBody,
  Button,
  Chip,
  Progress,
  addToast,
} from "@heroui/react";
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

const iconMap: Record<string, React.ComponentType<{ size?: number; stroke?: number; className?: string }>> = {
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

  // Poll for sync progress when syncing
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
        } catch {
          // Ignore polling errors
        }
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
        addToast({
          title: "Connected",
          description: `Successfully connected to ${connector.name}`,
          color: "success",
        });
      } else {
        addToast({
          title: "Connection Failed",
          description: data.error || "Failed to connect",
          color: "danger",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "An unexpected error occurred",
        color: "danger",
      });
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
        addToast({
          title: "Disconnected",
          description: `Disconnected from ${connector.name}`,
          color: "default",
        });
      } else {
        addToast({
          title: "Error",
          description: data.error || "Failed to disconnect",
          color: "danger",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "An unexpected error occurred",
        color: "danger",
      });
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
        addToast({
          title: "Sync Started",
          description: `Syncing ${connector.name}...`,
          color: "default",
        });
      } else {
        addToast({
          title: "Sync Failed",
          description: data.error || "Failed to start sync",
          color: "danger",
        });
      }
    } catch {
      addToast({
        title: "Error",
        description: "An unexpected error occurred",
        color: "danger",
      });
    }
  };

  return (
    <>
      <Card
        classNames={{
          base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
        }}
      >
        <CardBody className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0">
              <Icon
                size={24}
                stroke={1.5}
                className="text-neutral-700 dark:text-neutral-300"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-black dark:text-white">
                  {connector.name}
                </h3>
                {isConnected && (
                  <Chip
                    size="sm"
                    variant="flat"
                    startContent={<IconCheck size={12} stroke={2} />}
                    classNames={{
                      base: "bg-black/5 dark:bg-white/10",
                      content:
                        "text-neutral-600 dark:text-neutral-400 text-xs font-medium",
                    }}
                  >
                    Connected
                  </Chip>
                )}
                {isSyncing && (
                  <Chip
                    size="sm"
                    variant="flat"
                    startContent={
                      <IconLoader2 size={12} stroke={2} className="animate-spin" />
                    }
                    classNames={{
                      base: "bg-blue-50 dark:bg-blue-900/20",
                      content: "text-blue-600 dark:text-blue-400 text-xs font-medium",
                    }}
                  >
                    Syncing
                  </Chip>
                )}
                {connector.syncStatus === "error" && (
                  <Chip
                    size="sm"
                    variant="flat"
                    startContent={<IconAlertCircle size={12} stroke={2} />}
                    classNames={{
                      base: "bg-red-50 dark:bg-red-900/20",
                      content: "text-red-600 dark:text-red-400 text-xs font-medium",
                    }}
                  >
                    Error
                  </Chip>
                )}
              </div>
              <p className="text-sm text-neutral-500 mt-1">
                {connector.description}
              </p>

              {/* Connection stats */}
              {isConnected && (
                <div className="flex items-center gap-4 mt-3 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <IconClock size={14} />
                    Last sync: {formatRelativeTime(connector.lastSyncAt)}
                  </span>
                  {connector.itemsSynced > 0 && (
                    <span>{connector.itemsSynced} items synced</span>
                  )}
                </div>
              )}

              {/* Sync progress */}
              {isSyncing && (
                <div className="mt-3 space-y-1">
                  <Progress
                    value={connector.syncProgress}
                    size="sm"
                    classNames={{
                      track: "bg-black/10 dark:bg-white/10",
                      indicator: "bg-black dark:bg-white",
                    }}
                  />
                  <p className="text-xs text-neutral-500">
                    {connector.syncProgress}% complete
                  </p>
                </div>
              )}

              {/* Error message */}
              {connector.errorMessage && (
                <p className="text-xs text-red-500 mt-2">
                  {connector.errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            {isConnected ? (
              <>
                <Button
                  variant="bordered"
                  size="sm"
                  onPress={handleSync}
                  isDisabled={isSyncing || isDisconnecting}
                  className="border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                  startContent={
                    isSyncing ? (
                      <IconLoader2 size={14} className="animate-spin" />
                    ) : (
                      <IconRefresh size={14} />
                    )
                  }
                >
                  {isSyncing ? "Syncing..." : "Sync Now"}
                </Button>
                <Button
                  variant="bordered"
                  size="sm"
                  onPress={handleDisconnect}
                  isDisabled={isSyncing || isDisconnecting}
                  className="border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400"
                  startContent={
                    isDisconnecting && (
                      <IconLoader2 size={14} className="animate-spin" />
                    )
                  }
                >
                  {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onPress={handleConnect}
                isDisabled={isConnecting}
                className="bg-black dark:bg-white text-white dark:text-black font-medium"
                startContent={
                  isConnecting && (
                    <IconLoader2 size={14} className="animate-spin" />
                  )
                }
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            )}
          </div>
        </CardBody>
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
