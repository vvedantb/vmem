import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import { TracesPanel } from "@/components/traces/TracesPanel";

export const Route = createFileRoute("/_main/$profileId/traces")({
  component: TracesRoute,
});

function TracesRoute() {
  return (
    <PageContainer title="Traces" centeredMaxWidth>
      <TracesPanel />
    </PageContainer>
  );
}
