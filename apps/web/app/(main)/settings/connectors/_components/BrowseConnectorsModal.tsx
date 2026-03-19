"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Badge,
} from "@vmem/ui";
import { toast } from "sonner";
import {
  IconCheck,
  IconLoader2,
  IconBrandGoogleDrive,
  IconBrandOnedrive,
  IconBrandDropbox,
  IconBrandNotion,
  IconBrandSlack,
  IconBrandGithub,
} from "@tabler/icons-react";
import { api, type Doc } from "@vmem/backend";
import OAuthModal from "@/components/OAuthModal";

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
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [oauthConnector, setOauthConnector] =
    useState<Doc<"connectors"> | null>(null);

  const connectMutation = useMutation(api.connectors.connect);
  const disconnectMutation = useMutation(api.connectors.disconnect);

  const handleConnect = (connector: Doc<"connectors">) => {
    setOauthConnector(connector);
  };

  const handleOAuthComplete = async () => {
    if (!oauthConnector) return;
    setConnectingId(oauthConnector._id);
    try {
      await connectMutation({ id: oauthConnector._id });
      toast.success(`Connected to ${oauthConnector.name}`);
    } catch {
      toast.error("Failed to connect");
    } finally {
      setConnectingId(null);
      setOauthConnector(null);
    }
  };

  const handleDisconnect = async (connector: Doc<"connectors">) => {
    setConnectingId(connector._id);
    try {
      await disconnectMutation({ id: connector._id });
      toast(`Disconnected from ${connector.name}`);
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setConnectingId(null);
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
              const Icon = iconMap[connector.icon] || IconBrandGoogleDrive;
              const isConnected = connector.connectionStatus === "connected";
              const isLoading = connectingId === connector._id;

              return (
                <div
                  key={connector._id}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-muted/50 transition-colors min-w-0"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center flex-shrink-0">
                    <Icon size={20} stroke={1.5} className="text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {connector.name}
                      </p>
                      {isConnected && (
                        <Badge className="bg-primary/5 dark:bg-card/10 text-muted-foreground gap-1 text-xs">
                          <IconCheck size={10} stroke={2} />
                          Connected
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {connector.description}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {isConnected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(connector)}
                        disabled={isLoading}
                        className="text-muted-foreground"
                      >
                        {isLoading ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          "Disconnect"
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnect(connector)}
                        disabled={isLoading}
                        className="bg-primary text-primary-foreground"
                      >
                        {isLoading ? (
                          <IconLoader2 size={14} className="animate-spin" />
                        ) : (
                          "Connect"
                        )}
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
          connectorName={oauthConnector.name}
          onComplete={handleOAuthComplete}
        />
      )}
    </>
  );
}
