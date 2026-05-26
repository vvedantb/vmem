"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@vmem/ui";
import { api, type Doc } from "@vmem/backend";
import {
  isConnectorConnected,
  isConnectorConnectable,
} from "@/components/settings/connector-utils";
import OAuthModal from "@/components/OAuthModal";
import { GitHubConnectorControls } from "./GitHubConnectorControls";
import {
  GoogleDriveIcon,
  GmailIcon,
  OneDriveIcon,
  DropboxIcon,
  NotionIcon,
  SlackIcon,
  GitHubIcon,
  LinearIcon,
} from "@/components/brand-icons";

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

interface BrowseConnectorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectors: Doc<"connectors">[];
}

export default function BrowseConnectorsModal({
  isOpen,
  onClose,
  connectors,
}: BrowseConnectorsModalProps) {
  const [oauthConnector, setOauthConnector] =
    useState<Doc<"connectors"> | null>(null);

  const githubConnection = useQuery(api.github.getConnection);

  const availableConnectors = useMemo(() => {
    return connectors
      .filter(
        (connector) =>
          isConnectorConnectable(connector) &&
          !isConnectorConnected(connector, githubConnection),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [connectors, githubConnection]);

  const handleConnect = (connector: Doc<"connectors">) => {
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
            {availableConnectors.map((connector) => {
              const Icon = iconMap[connector.icon] || GoogleDriveIcon;
              const isGitHub = connector.name === "GitHub";
              const hasProvider = isGitHub || !!connector.provider;

              return (
                <div
                  key={connector._id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-surface-tertiary/50 transition-colors min-w-0"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-secondary/60 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {connector.name}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {connector.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isGitHub ? (
                      <GitHubConnectorControls connection={githubConnection} />
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleConnect(connector)}
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
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
