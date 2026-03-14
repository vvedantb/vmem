"use client";

import { useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { Card, CardContent, Skeleton, Button } from "@vmem/ui";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import PageContainer from "@/components/PageContainer";
import ConnectorCard from "@/components/ConnectorCard";

export default function ConnectorsPage() {
  const connectors = useQuery(api.connectors.listMy);
  const seedDefaults = useMutation(api.connectors.seedDefaults);

  useEffect(() => {
    if (connectors && connectors.length === 0) {
      seedDefaults();
    }
  }, [connectors, seedDefaults]);

  if (connectors === undefined) {
    return (
      <PageContainer title="Connectors">
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

  return (
    <PageContainer title="Connectors">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((connector) => (
          <ConnectorCard key={connector._id} connector={connector} />
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
