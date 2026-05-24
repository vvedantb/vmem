import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useTeamDetail } from "./-team-context";
import { TeamSettings } from "./_components/TeamSettings";

export const Route = createFileRoute("/_main/teams/$teamId/settings")({
  component: TeamSettingsRoute,
});

function TeamSettingsRoute() {
  const data = useTeamDetail();

  if (data.role !== "owner") {
    return (
      <Navigate
        to="/teams/$teamId/overview"
        params={{ teamId: data.team._id }}
        replace
      />
    );
  }

  return <TeamSettings data={data} />;
}
