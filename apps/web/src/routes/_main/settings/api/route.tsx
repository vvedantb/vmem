"use client";

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { ApiTabs } from "./-components/ApiTabs";
import { ApiCreateKeyProvider } from "./-components/ApiCreateKeyContext";

export const Route = createFileRoute("/_main/settings/api")({
  component: ApiLayout,
});

function ApiLayout() {
  const matchRoute = useMatchRoute();
  const isKeys = matchRoute({ to: "/settings/api/keys" });
  const isUsage = matchRoute({ to: "/settings/api/usage" });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <ApiCreateKeyProvider
      isCreateModalOpen={isCreateModalOpen}
      setIsCreateModalOpen={setIsCreateModalOpen}
    >
      <PageContainer
        title="API"
        showTitle={false}
        centeredMaxWidth
        noScroll={isUsage ? true : undefined}
        leftSection={<ApiTabs />}
        rightSection={
          isKeys ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <IconPlus size={16} />
              New Key
            </Button>
          ) : undefined
        }
      >
        <Outlet />
      </PageContainer>
    </ApiCreateKeyProvider>
  );
}
