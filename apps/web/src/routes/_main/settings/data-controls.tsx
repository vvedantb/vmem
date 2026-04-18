import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";

export const Route = createFileRoute("/_main/settings/data-controls")({
  component: DataControlsPage,
});

function DataControlsPage() {
  return (
    <PageContainer title="Data Controls" centeredMaxWidth showTitle>
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8"></div>
    </PageContainer>
  );
}
