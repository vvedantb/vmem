import { createFileRoute } from "@tanstack/react-router";
import { TeamMembers } from "@/components/teams/TeamMembers";

export const Route = createFileRoute("/_main/$profileId/team/members")({
  component: TeamMembers,
});
