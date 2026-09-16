import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@vmem/ui";
import { IconPlus } from "@tabler/icons-react";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { ApiTabs, apiTabFromPathname } from "./-components/ApiTabs";
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
      aria-label="New Key"
      onClick={() => setIsCreateModalOpen(true)}
    >
      <IconPlus size={16} />
      New
      <span className="max-sm:sr-only"> Key</span>
    </Button>
  );
}

function ApiPageShell({
  headerRight,
  fillHeight,
  children,
}: {
  headerRight?: ReactNode;
  fillHeight?: boolean;
  children: ReactNode;
}) {
  return (
    <SettingsPage
      title="API"
      headerRight={headerRight}
      tabs={<ApiTabs />}
      stack={false}
      fillHeight={fillHeight}
    >
      {children}
    </SettingsPage>
  );
}

function ApiLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const activeTab = apiTabFromPathname(pathname);

  return (
    <ApiCreateKeyProvider>
      <ApiPageShell
        headerRight={activeTab === "keys" ? <ApiNewKeyButton /> : undefined}
        fillHeight={activeTab === "usage"}
      >
        <Outlet />
      </ApiPageShell>
    </ApiCreateKeyProvider>
  );
}
