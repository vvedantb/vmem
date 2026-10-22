import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import { DreamingPanel } from "@/components/dreaming/DreamingPanel";

export const Route = createFileRoute("/_main/$profileId/dreaming")({
  component: DreamingRoute,
});

function DreamingRoute() {
  return (
    <PageContainer title="Dreaming" centeredMaxWidth>
      <DreamingPanel />
    </PageContainer>
  );
}
