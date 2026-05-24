import { createFileRoute } from "@tanstack/react-router";
import { useTeamDetail } from "./-team-context";
import { TeamOverview } from "./_components/TeamOverview";

export const Route = createFileRoute("/_main/teams/$teamId/overview")({
  component: TeamOverviewRoute,
});

function TeamOverviewRoute() {
  const data = useTeamDetail();
  return <TeamOverview data={data} />;
}
