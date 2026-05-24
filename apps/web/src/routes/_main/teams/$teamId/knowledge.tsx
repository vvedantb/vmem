import { createFileRoute } from "@tanstack/react-router";
import { useTeamDetail } from "./-team-context";
import { TeamKnowledge } from "./_components/TeamKnowledge";

export const Route = createFileRoute("/_main/teams/$teamId/knowledge")({
  component: TeamKnowledgeRoute,
});

function TeamKnowledgeRoute() {
  const data = useTeamDetail();
  return <TeamKnowledge data={data} />;
}
