import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import Dashboard from "@/components/dashboard/Dashboard";
import { HomeSectionTabRows } from "@/components/dashboard/HomeSectionTabs";

export const Route = createFileRoute("/_main/$profileId/home")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <PageContainer
      title="Dashboard"
      centeredMaxWidth
      insetHeader
      showTitle
      tabs={<HomeSectionTabRows />}
    >
      <Dashboard />
    </PageContainer>
  );
}
