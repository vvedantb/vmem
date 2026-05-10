import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { DataControlsTabs } from "./-components/DataControlsTabs";
import { DangerZonePanel } from "./-components/DangerZonePanel";

export const Route = createFileRoute("/_main/settings/data-controls/danger")({
  component: DangerRoute,
});

/**
 * `/settings/data-controls/danger` — irreversible operations on the
 * user's own data. Today: wipe all memories. Future: reset
 * relationships, delete account, etc.
 */
function DangerRoute() {
  return (
    <PageContainer
      title="Data Controls"
      showTitle={false}
      centeredMaxWidth
      leftSection={<DataControlsTabs />}
    >
      <DangerZonePanel />
    </PageContainer>
  );
}
