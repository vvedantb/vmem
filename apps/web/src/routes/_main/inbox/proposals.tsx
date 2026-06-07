import { createFileRoute } from "@tanstack/react-router";
import { ProposalsPanel } from "./-components/ProposalsPanel";

export const Route = createFileRoute("/_main/inbox/proposals")({
  component: ProposalsRoute,
});

function ProposalsRoute() {
  return <ProposalsPanel />;
}
