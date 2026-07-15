import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import { ApiTabs, getActiveApiTab } from "./-components/ApiTabs";
import {
  ApiCreateKeyProvider,
  useApiCreateKeyModal,
} from "./-components/ApiCreateKeyContext";

export const Route = createFileRoute("/_main/settings/api")({
  component: ApiLayout,
});

function ApiNewKeyButton() {
  const { setIsCreateModalOpen } = useApiCreateKeyModal();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsCreateModalOpen(true)}
    >
      <IconPlus size={16} />
      New Key
    </Button>
  );
}

function ApiUsagePageShell({ children }: { children: ReactNode }) {
  return (
    <PageContainer
      title="API"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ApiTabs />}
    >
      {children}
    </PageContainer>
  );
}

function ApiKeysPageShell({ children }: { children: ReactNode }) {
  return (
    <PageContainer
      title="API"
      showTitle={false}
      centeredMaxWidth
      leftSection={<ApiTabs />}
      rightSection={<ApiNewKeyButton />}
    >
      {children}
    </PageContainer>
  );
}

function ApiLayout() {
  const matchRoute = useMatchRoute();
  const activeTab = getActiveApiTab(matchRoute);

  const pageShell =
    activeTab === "usage" ? ApiUsagePageShell : ApiKeysPageShell;
  const PageShell = pageShell;

  return (
    <ApiCreateKeyProvider>
      <PageShell>
        <Outlet />
      </PageShell>
    </ApiCreateKeyProvider>
  );
}
