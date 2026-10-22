import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import { ArtifactsPanel } from "@/components/artifacts/ArtifactsPanel";
import { useActiveProfile } from "@/components/workspace/active-profile";

export const Route = createFileRoute("/_main/$profileId/artifacts/")({
  component: ArtifactsRoute,
});

// team profiles show the team's artifacts, like Files and Skills
function ArtifactsRoute() {
  const { profileId } = Route.useParams();
  const teamId = useActiveProfile().teamId;
  return (
    <PageContainer title="Artifacts" centeredMaxWidth>
      <ArtifactsPanel profileId={profileId} teamId={teamId} />
    </PageContainer>
  );
}
