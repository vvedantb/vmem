import PageContainer from "@/components/PageContainer";
import Dashboard from "@/components/Dashboard";

export default function DashboardPage() {
  return (
    <PageContainer
      title="Dashboard"
      description="View your memories, tags, and more"
    >
      <Dashboard />
    </PageContainer>
  );
}
