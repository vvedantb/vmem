import { createFileRoute } from "@tanstack/react-router";
import { useTeamDetail } from "@/components/teams/team-context";
import { TeamMembers } from "@/components/teams/TeamMembers";

export const Route = createFileRoute("/_main/$profileId/team/members")({
  component: TeamMembersRoute,
});

function TeamMembersRoute() {
  const data = useTeamDetail();
  return <TeamMembers data={data} />;
}
