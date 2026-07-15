import { useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@vmem/ui";
import { api } from "@vmem/backend";
import {
  isConnectorConnected,
  isConnectorConnectable,
  isGitHubConnector,
  resolveConnectorIcon,
  type Connector,
  type GitHubConnection,
} from "./connector-utils";
import OAuthModal from "@/components/OAuthModal";
import { GitHubConnectorControls } from "./GitHubConnectorControls";

function ConnectorRow({
  connector,
  githubConnection,
  onConnect,
}: {
  connector: Connector;
  githubConnection: GitHubConnection | undefined;
  onConnect: (connector: Connector) => void;
}) {
  const Icon = resolveConnectorIcon(connector.icon);

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-tertiary/50 transition-colors min-w-0">
      <div className="w-10 h-10 rounded-lg bg-surface-secondary/60 flex items-center justify-center flex-shrink-0">
        <Icon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{connector.name}</p>
        <p className="text-xs text-muted truncate">{connector.description}</p>
      </div>
      <div className="flex-shrink-0">
        {isGitHubConnector(connector) ? (
          <GitHubConnectorControls connection={githubConnection} />
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onConnect(connector)}
          >
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

interface BrowseConnectorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectors: Connector[];
}

export default function BrowseConnectorsModal({
  isOpen,
  onClose,
  connectors,
}: BrowseConnectorsModalProps) {
  const [oauthConnector, setOauthConnector] = useState<Connector | null>(null);

  const githubConnection = useQuery(api.github.getConnection);

  const availableConnectors = connectors
    .filter(
      (connector) =>
        isConnectorConnectable(connector) &&
        !isConnectorConnected(connector, githubConnection),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleConnect = (connector: Connector) => {
    setOauthConnector(connector);
  };

  const handleOAuthComplete = () => {
    if (!oauthConnector) return;
    toast.success(`Connected to ${oauthConnector.name}`);
    setOauthConnector(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Browse Connectors
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1 overflow-hidden">
            {availableConnectors.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">
                All connectors are connected.
              </p>
            ) : null}
            {availableConnectors.map((connector) => (
              <ConnectorRow
                key={connector._id}
                connector={connector}
                githubConnection={githubConnection}
                onConnect={handleConnect}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {oauthConnector ? (
        <OAuthModal
          isOpen
          onClose={() => setOauthConnector(null)}
          connectorId={oauthConnector._id}
          connectorName={oauthConnector.name}
          onComplete={handleOAuthComplete}
        />
      ) : null}
    </>
  );
}
