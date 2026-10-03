import { createFileRoute } from "@tanstack/react-router";
import { ConnectorsScreen } from "@/routes/_main/settings/connectors";
import { SourcesTabs } from "@/components/dashboard/HomeSectionTabs";

export const Route = createFileRoute("/_main/$profileId/sources/connectors")({
  component: SourcesConnectorsRoute,
});

function SourcesConnectorsRoute() {
  return <ConnectorsScreen tabs={<SourcesTabs />} />;
}
