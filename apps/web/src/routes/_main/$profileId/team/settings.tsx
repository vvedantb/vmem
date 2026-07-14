import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTeamDetail } from "@/components/teams/team-context";
import { TeamSettings } from "@/components/teams/TeamSettings";

export const Route = createFileRoute("/_main/$profileId/team/settings")({
  component: TeamSettingsRoute,
});

function TeamSettingsRoute() {
  const { profileId } = Route.useParams();
  const data = useTeamDetail();

  if (data.role !== "owner") {
    return (
      <Navigate to="/$profileId/team/members" params={{ profileId }} replace />
    );
  }

  return <TeamSettings />;
}
