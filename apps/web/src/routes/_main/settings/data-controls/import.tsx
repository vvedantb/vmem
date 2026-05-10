import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import ImportPageClient from "@/components/settings/ImportPageClient";
import { DataControlsTabs } from "./-components/DataControlsTabs";

export const Route = createFileRoute("/_main/settings/data-controls/import")({
  component: ImportRoute,
});

/**
 * `/settings/data-controls/import` — bring memories in from external
 * services (ChatGPT, Claude, etc.). Shares the page header with the
 * Export and Data Control tabs.
 */
function ImportRoute() {
  return (
    <PageContainer
      title="Data Controls"
      showTitle={false}
      centeredMaxWidth
      leftSection={<DataControlsTabs />}
    >
      <ImportPageClient />
    </PageContainer>
  );
}
