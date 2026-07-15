import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Card, CardContent, Button, Badge, Progress } from "@vmem/ui";
import { toast } from "sonner";
import { IconLoader2, IconAlertCircle, IconClock } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import OAuthModal from "./OAuthModal";
import { GitHubConnectorControls } from "./GitHubConnectorControls";
import DeleteConnectorDataDialog from "./DeleteConnectorDataDialog";
import DisconnectConnectorDialog from "./DisconnectConnectorDialog";
import ConnectorActionsMenu from "./ConnectorActionsMenu";
import {
  isConnectorConnected,
  isConnectorConnectable,
  isGitHubConnector,
  resolveConnectorIcon,
  type Connector,
} from "./connector-utils";
import { formatRelativeTime } from "@vmem/shared";

interface ConnectorCardProps {
  connector: Connector;
}

export default function ConnectorCard({ connector }: ConnectorCardProps) {
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [showDeleteDataDialog, setShowDeleteDataDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const startSyncAction = useAction(api.connectors.sync.startSync);

  const isGitHub = isGitHubConnector(connector);
  const githubConnection = useQuery(
    api.github.getConnection,
    isGitHub ? {} : "skip",
  );

  const Icon = resolveConnectorIcon(connector.icon);
  const isConnected = isConnectorConnected(connector, githubConnection);
  const isSyncing = !isGitHub && connector.syncStatus === "syncing";
  const hasProvider = isConnectorConnectable(connector);
  const canDeleteImportedData =
    hasProvider &&
    !isGitHub &&
    (isConnected ||
      connector.itemsSynced > 0 ||
      connector.lastSyncAt !== undefined);

  const handleOAuthComplete = () => {
    toast.success(`Successfully connected to ${connector.name}`);
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
      <Card className="shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-surface-secondary/60 flex items-center justify-center flex-shrink-0">
              <Icon size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-foreground text-balance">
                  {connector.name}
                </h3>
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
                  <p className="text-xs text-muted tabular-nums">
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
                isSyncing={isSyncing}
                isBusy={isSyncing}
                actions={
                  canDeleteImportedData
                    ? ["sync", "disconnect", "delete-data"]
                    : ["sync", "disconnect"]
                }
                onSync={handleSync}
                onDisconnect={() => setShowDisconnectDialog(true)}
                onDeleteData={() => setShowDeleteDataDialog(true)}
              />
            ) : (
              <>
                {canDeleteImportedData ? (
                  <ConnectorActionsMenu
                    connectorName={connector.name}
                    isSyncing={false}
                    isBusy={false}
                    actions={["delete-data"]}
                    onSync={handleSync}
                    onDisconnect={() => setShowDisconnectDialog(true)}
                    onDeleteData={() => setShowDeleteDataDialog(true)}
                  />
                ) : null}
                <Button size="sm" variant="secondary">
                  Connect
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
