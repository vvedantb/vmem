import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import Dashboard from "@/components/Dashboard";

export const Route = createFileRoute("/_main/home")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <PageContainer title="Dashboard">
      <Dashboard />
    </PageContainer>
  );
}
