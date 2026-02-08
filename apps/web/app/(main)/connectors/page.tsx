"use client";

import { useState, useEffect, useCallback } from "react";
import { Button, Card, CardBody, Skeleton } from "@heroui/react";
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
      prev.map((c) => (c.id === updatedConnector.id ? updatedConnector : c))
    );
  }, []);

  // Loading state
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
              classNames={{
                base: "border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none",
              }}
            >
              <CardBody className="p-6">
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
              </CardBody>
            </Card>
          ))}
        </div>
      </PageContainer>
    );
  }

  // Error state
  if (error) {
    return (
      <PageContainer
        title="Connectors"
        description="Connect external apps to import and sync your data"
      >
        <Card
          classNames={{
            base: "border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 shadow-none",
          }}
        >
          <CardBody className="p-8 text-center">
            <IconAlertCircle
              size={48}
              className="text-red-500 mx-auto mb-4"
              stroke={1.5}
            />
            <p className="text-neutral-800 dark:text-neutral-200 font-medium mb-2">
              Failed to load connectors
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              {error}
            </p>
            <Button
              onPress={fetchConnectors}
              variant="bordered"
              className="border-red-300 dark:border-red-700 text-red-600 dark:text-red-400"
              startContent={<IconRefresh size={16} />}
            >
              Try Again
            </Button>
          </CardBody>
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

      <Card
        classNames={{
          base: "border border-dashed border-black/20 dark:border-white/20 bg-black/[0.01] dark:bg-white/[0.01] shadow-none",
        }}
      >
        <CardBody className="p-6 text-center">
          <p className="text-neutral-500">
            More connectors coming soon. Have a request?
          </p>
          <Button variant="light" size="sm" className="mt-3 font-medium">
            Submit a request →
          </Button>
        </CardBody>
      </Card>
    </PageContainer>
  );
}
