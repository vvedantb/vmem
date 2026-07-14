import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTeamWorkspace } from "@/components/teams/team-context";
import { TeamSettings } from "@/components/teams/TeamSettings";

export const Route = createFileRoute("/_main/$profileId/team/settings")({
  component: TeamSettingsRoute,
});

function TeamSettingsRoute() {
  const { profileId } = Route.useParams();
  const { meta } = useTeamWorkspace();

  if (!meta.isOwner) {
    return (
      <Navigate to="/$profileId/team/members" params={{ profileId }} replace />
    );
  }

  return <TeamSettings />;
}
