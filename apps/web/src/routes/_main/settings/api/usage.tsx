import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ApiTabs } from "./-components/ApiTabs";
import { UsagePanel } from "./-components/UsagePanel";

export const Route = createFileRoute("/_main/settings/api/usage")({
  component: UsageRoute,
});

/**
 * `/settings/api/usage` — analytics on what those API credentials called.
 * Self-contained subroute mirroring `keys.tsx`.
 */
function UsageRoute() {
  return (
    <PageContainer
      title="API"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ApiTabs />}
    >
      <UsagePanel />
    </PageContainer>
  );
}
