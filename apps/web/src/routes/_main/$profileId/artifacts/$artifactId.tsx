import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import { ArtifactDetailPanel } from "@/components/artifacts/ArtifactDetailPanel";

export const Route = createFileRoute("/_main/$profileId/artifacts/$artifactId")(
  { component: ArtifactRoute },
);

function ArtifactRoute() {
  const { profileId, artifactId } = Route.useParams();
  return (
    <PageContainer title="Artifact" noScroll centeredMaxWidth>
      <ArtifactDetailPanel
        // a new artifact gets a fresh viewer (and state store)
        key={artifactId}
        profileId={profileId}
        artifactId={artifactId}
      />
    </PageContainer>
  );
}
