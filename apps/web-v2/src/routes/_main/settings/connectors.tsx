import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { Card, CardContent, Skeleton, Button } from "@vmem/ui";
import { IconPlug, IconPlus } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import ConnectorCard from "@/components/ConnectorCard";
import BrowseConnectorsModal from "@/components/settings/BrowseConnectorsModal";

export const Route = createFileRoute("/_main/settings/connectors")({
  component: ConnectorsPage,
});

function ConnectorsPage() {
  const connectors = useQuery(api.connectors.listMy);
  const seedDefaults = useMutation(api.connectors.seedDefaults);
  const [showBrowse, setShowBrowse] = useState(false);
  const seededRef = useRef(false);

  // seedDefaults is idempotent — creates missing connectors and updates providers
  useEffect(() => {
    if (connectors !== undefined && !seededRef.current) {
      seededRef.current = true;
      seedDefaults();
    }
  }, [connectors, seedDefaults]);

  const connectedConnectors = useMemo(
    () => connectors?.filter((c) => c.connectionStatus === "connected") ?? [],
    [connectors],
  );

  if (connectors === undefined) {
    return (
      <PageContainer title="Connectors" centeredMaxWidth>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card
              key={i}
              className="border border-border bg-muted/50 shadow-none"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32 rounded" />
                    <Skeleton className="h-4 w-full rounded" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Skeleton className="h-8 w-24 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <>
      <PageContainer
        title="Connectors"
        centeredMaxWidth
        rightSection={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowBrowse(true)}
          >
            <IconPlus size={16} />
            Browse Connectors
          </Button>
        }
      >
        {connectedConnectors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <IconPlug
              size={40}
              stroke={1.5}
              className="mb-3 text-muted-foreground"
            />
            <p className="mb-4 text-sm text-muted-foreground">
              No connectors linked yet
            </p>
            <Button size="sm" onClick={() => setShowBrowse(true)}>
              <IconPlus size={16} />
              Browse Connectors
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {connectedConnectors.map((connector) => (
              <ConnectorCard key={connector._id} connector={connector} />
            ))}
          </div>
        )}
      </PageContainer>

      {connectors && (
        <BrowseConnectorsModal
          isOpen={showBrowse}
          onClose={() => setShowBrowse(false)}
          connectors={connectors}
        />
      )}
    </>
  );
}
