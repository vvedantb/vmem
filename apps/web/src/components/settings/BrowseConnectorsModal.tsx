"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from "@vmem/ui";
import { toast } from "sonner";
import { IconLoader2 } from "@tabler/icons-react";
import { api, type Doc } from "@vmem/backend";
import OAuthModal from "@/components/OAuthModal";
import {
  GoogleDriveIcon,
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
  const [disconnectTarget, setDisconnectTarget] =
    useState<Doc<"connectors"> | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [oauthConnector, setOauthConnector] =
    useState<Doc<"connectors"> | null>(null);

  const disconnectAction = useAction(api.connectorOAuth.disconnect);

  const handleConnect = (connector: Doc<"connectors">) => {
    if (!connector.provider) {
      toast.info(`${connector.name} support coming soon!`);
      return;
    }
    setOauthConnector(connector);
  };

  const handleOAuthComplete = () => {
    if (!oauthConnector) return;
    toast.success(`Connected to ${oauthConnector.name}`);
    setOauthConnector(null);
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    setIsDisconnecting(true);
    try {
      await disconnectAction({ connectorId: disconnectTarget._id });
      toast(`Disconnected from ${disconnectTarget.name}`);
      setDisconnectTarget(null);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setIsDisconnecting(false);
    }
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
            {connectors.map((connector) => {
              const Icon = iconMap[connector.icon] || GoogleDriveIcon;
              const isConnected = connector.connectionStatus === "connected";
              const hasProvider = !!connector.provider;

              return (
                <div
                  key={connector._id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted/50 transition-colors min-w-0"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {connector.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {connector.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectTarget(connector)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(connector)}
                        disabled={!hasProvider}
                        className={
                          hasProvider
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground cursor-not-allowed"
                        }
                      >
                        {hasProvider ? "Connect" : "Soon"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {oauthConnector && (
        <OAuthModal
          isOpen={!!oauthConnector}
          onClose={() => setOauthConnector(null)}
          connectorId={oauthConnector._id}
          connectorName={oauthConnector.name}
          onComplete={handleOAuthComplete}
        />
      )}

      <Dialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Disconnect {disconnectTarget?.name}?</DialogTitle>
            <DialogDescription>
              This will remove access to {disconnectTarget?.name}. You can
              reconnect anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDisconnectTarget(null)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDisconnectConfirm()}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                "Disconnect"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
