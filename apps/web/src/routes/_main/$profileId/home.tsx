import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import Dashboard from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/_main/$profileId/home")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <PageContainer title="Dashboard" centeredMaxWidth showTitle>
      <Dashboard />
    </PageContainer>
  );
}
