import { createFileRoute } from "@tanstack/react-router";
import { useTeamDetail } from "./-team-context";
import { TeamMembers } from "./_components/TeamMembers";

export const Route = createFileRoute("/_main/teams/$teamId/members")({
  component: TeamMembersRoute,
});

function TeamMembersRoute() {
  const data = useTeamDetail();
  return <TeamMembers data={data} />;
}
