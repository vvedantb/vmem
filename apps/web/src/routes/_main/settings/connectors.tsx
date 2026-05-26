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

  const githubConnection = useQuery(api.github.getConnection);

  const sortedConnectors = useMemo(() => {
    if (!connectors) return [];
    return [...connectors].sort((a, b) => {
      const aConnected =
        a.name === "GitHub"
          ? Boolean(githubConnection)
          : a.connectionStatus === "connected";
      const bConnected =
        b.name === "GitHub"
          ? Boolean(githubConnection)
          : b.connectionStatus === "connected";
      if (aConnected === bConnected) return a.name.localeCompare(b.name);
      return aConnected ? -1 : 1;
    });
  }, [connectors, githubConnection]);

  const hasAnyConnection = useMemo(() => {
    if (!connectors) return false;
    return connectors.some(
      (c) =>
        c.connectionStatus === "connected" ||
        (c.name === "GitHub" &&
          githubConnection !== undefined &&
          githubConnection !== null),
    );
  }, [connectors, githubConnection]);

  if (connectors === undefined) {
    return (
      <PageContainer title="Connectors" centeredMaxWidth>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="bg-surface-secondary/50 shadow-none">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
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
        {sortedConnectors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <IconPlug size={40} stroke={1.5} className="mb-3 text-muted" />
            <p className="mb-4 text-sm text-muted">
              No connectors available yet
            </p>
          </div>
        ) : (
          <>
            {!hasAnyConnection ? (
              <p className="mb-4 text-sm text-muted">
                Connect a source below to start syncing.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sortedConnectors.map((connector) => (
                <ConnectorCard key={connector._id} connector={connector} />
              ))}
            </div>
          </>
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
