"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Card, CardContent, Skeleton } from "@vmem/ui";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import ConnectorCard from "@/components/ConnectorCard";
import type { Connector } from "@/app/api/connectors/store";

export default function ConnectorsPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConnectors = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/connectors");
      const data = await response.json();

      if (data.success) {
        setConnectors(data.data);
      } else {
        setError(data.error || "Failed to load connectors");
      }
    } catch {
      setError("Failed to load connectors. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectors();
  }, [fetchConnectors]);

  const handleConnectorUpdate = useCallback((updatedConnector: Connector) => {
    setConnectors((prev) =>
      prev.map((c) => (c.id === updatedConnector.id ? updatedConnector : c)),
    );
  }, []);

  if (isLoading) {
    return (
      <PageContainer
        title="Connectors"
        description="Connect external apps to import and sync your data"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card
              key={i}
              className="border border-border bg-muted/50 shadow-none"
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-12 h-12 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-32 h-5 rounded" />
                    <Skeleton className="w-full h-4 rounded" />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Skeleton className="w-24 h-8 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer
        title="Connectors"
        description="Connect external apps to import and sync your data"
      >
        <Card className="border border-destructive/30 bg-destructive/10 shadow-none">
          <CardContent className="p-8 text-center">
            <IconAlertCircle
              size={48}
              className="text-destructive mx-auto mb-4"
              stroke={1.5}
            />
            <p className="text-foreground font-medium mb-2">
              Failed to load connectors
            </p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button
              onClick={fetchConnectors}
              variant="outline"
              className="border-destructive/30 text-destructive"
            >
              <IconRefresh size={16} />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Connectors"
      description="Connect external apps to import and sync your data"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((connector) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            onUpdate={handleConnectorUpdate}
          />
        ))}
      </div>

      <Card className="border border-dashed border-border/80 bg-muted/50 shadow-none">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">
            More connectors coming soon. Have a request?
          </p>
          <Button variant="ghost" size="sm" className="mt-3 font-medium">
            Submit a request &rarr;
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
