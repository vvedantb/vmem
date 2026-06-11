import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import Dashboard from "@/components/Dashboard";

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
