"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Card, CardContent, Button, Badge, Progress } from "@vmem/ui";
import { toast } from "sonner";
import {
  IconLoader2,
  IconAlertCircle,
  IconClock,
  IconClockHour4,
} from "@tabler/icons-react";
import { api, type Doc } from "@vmem/backend";
import OAuthModal from "./OAuthModal";
import { GitHubConnectorControls } from "./settings/GitHubConnectorControls";
import DeleteConnectorDataDialog from "./settings/DeleteConnectorDataDialog";
import DisconnectConnectorDialog from "./settings/DisconnectConnectorDialog";
import ConnectorActionsMenu from "./settings/ConnectorActionsMenu";
import {
  GoogleDriveIcon,
  GmailIcon,
  OneDriveIcon,
  DropboxIcon,
  NotionIcon,
  SlackIcon,
  GitHubIcon,
  LinearIcon,
} from "./brand-icons";
import { formatRelativeTime } from "@/lib/formatters";

const iconMap: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  IconBrandGoogleDrive: GoogleDriveIcon,
  IconBrandGmail: GmailIcon,
  IconBrandOnedrive: OneDriveIcon,
  IconBrandDropbox: DropboxIcon,
  IconBrandNotion: NotionIcon,
  IconBrandSlack: SlackIcon,
  IconBrandGithub: GitHubIcon,
  IconBrandLinear: LinearIcon,
};

interface ConnectorCardProps {
  connector: Doc<"connectors">;
}

export default function ConnectorCard({ connector }: ConnectorCardProps) {
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showDeleteDataDialog, setShowDeleteDataDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const startSyncAction = useAction(api.connectorSync.startSync);

  const isGitHub = connector.name === "GitHub";
  const githubConnection = useQuery(
    api.github.getConnection,
    isGitHub ? {} : "skip",
  );

  const Icon = iconMap[connector.icon] || GoogleDriveIcon;
  const isConnected = isGitHub
    ? githubConnection !== undefined && githubConnection !== null
    : connector.connectionStatus === "connected";
  const isSyncing = !isGitHub && connector.syncStatus === "syncing";
  const hasProvider = isGitHub || !!connector.provider;
  const isLinear = connector.provider === "linear";
  const canDeleteImportedData =
    hasProvider &&
    !isGitHub &&
    (isConnected ||
      connector.itemsSynced > 0 ||
      connector.lastSyncAt !== undefined);

  const handleConnect = () => {
    if (!hasProvider) {
      toast.info(`${connector.name} support coming soon!`);
      return;
    }
    setShowOAuthModal(true);
  };

  const handleOAuthComplete = () => {
    toast.success(`Successfully connected to ${connector.name}`);
  };

  const handleSync = async (fullHistory = false) => {
    try {
      await startSyncAction({ connectorId: connector._id, fullHistory });
      toast(
        fullHistory
          ? `Syncing all ${connector.name} history...`
          : `Syncing ${connector.name}...`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start sync");
    }
  };

  return (
    <>
      <Card className="shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-surface-secondary/60 flex items-center justify-center flex-shrink-0">
              <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-foreground">
                  {connector.name}
                </h3>
                {!hasProvider && !isConnected && (
                  <Badge variant="secondary" className="gap-1">
                    <IconClockHour4 size={12} stroke={2} />
                    Coming Soon
                  </Badge>
                )}
                {isSyncing && (
                  <Badge className="bg-accent/10 text-accent gap-1">
                    <IconLoader2
                      size={12}
                      stroke={2}
                      className="animate-spin"
                    />
                    Syncing
                  </Badge>
                )}
                {connector.syncStatus === "error" && (
                  <Badge className="bg-danger/10 text-danger gap-1">
                    <IconAlertCircle size={12} stroke={2} />
                    Error
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted mt-1">{connector.description}</p>

              {isGitHub && githubConnection ? (
                <p className="mt-1 text-sm text-muted">
                  Connected as{" "}
                  <span className="font-medium text-foreground">
                    {githubConnection.githubUsername}
                  </span>
                </p>
              ) : null}

              {isConnected && !isGitHub && (
                <div className="flex items-center gap-4 mt-3 text-xs text-muted">
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
                    className="h-1.5 bg-surface-secondary [&>div]:bg-accent"
                  />
                  <p className="text-xs text-muted">
                    {connector.syncProgress}% complete
                  </p>
                </div>
              )}

              {connector.errorMessage && (
                <p className="text-xs text-danger mt-2">
                  {connector.errorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {isGitHub ? (
              <GitHubConnectorControls connection={githubConnection} />
            ) : isConnected ? (
              <ConnectorActionsMenu
                connectorName={connector.name}
                isLinear={isLinear}
                isSyncing={isSyncing}
                isBusy={isSyncing}
                showSyncActions
                showDisconnect
                showDeleteData={canDeleteImportedData}
                onSync={handleSync}
                onDisconnect={() => setShowDisconnectDialog(true)}
                onDeleteData={() => setShowDeleteDataDialog(true)}
              />
            ) : (
              <>
                {canDeleteImportedData ? (
                  <ConnectorActionsMenu
                    connectorName={connector.name}
                    isLinear={isLinear}
                    isSyncing={false}
                    isBusy={false}
                    showSyncActions={false}
                    showDisconnect={false}
                    showDeleteData
                    onSync={handleSync}
                    onDisconnect={() => setShowDisconnectDialog(true)}
                    onDeleteData={() => setShowDeleteDataDialog(true)}
                  />
                ) : null}
                <Button
                  size="sm"
                  onClick={handleConnect}
                  disabled={!hasProvider}
                  className={
                    hasProvider
                      ? "bg-surface text-foreground font-medium"
                      : "bg-surface-secondary text-muted cursor-not-allowed"
                  }
                >
                  {hasProvider ? "Connect" : "Coming Soon"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {hasProvider && !isGitHub ? (
        <>
          <OAuthModal
            isOpen={showOAuthModal}
            onClose={() => setShowOAuthModal(false)}
            connectorId={connector._id}
            connectorName={connector.name}
            onComplete={handleOAuthComplete}
          />
          <DisconnectConnectorDialog
            open={showDisconnectDialog}
            onClose={() => setShowDisconnectDialog(false)}
            connectorId={connector._id}
            connectorName={connector.name}
          />
          <DeleteConnectorDataDialog
            open={showDeleteDataDialog}
            onClose={() => setShowDeleteDataDialog(false)}
            connectorId={connector._id}
            connectorName={connector.name}
          />
        </>
      ) : null}
    </>
  );
}
