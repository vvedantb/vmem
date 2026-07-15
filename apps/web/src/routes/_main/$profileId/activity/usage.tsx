import { createFileRoute } from "@tanstack/react-router";
import { AiLogsPanel } from "@/components/activity/AiLogsPanel";

export const Route = createFileRoute("/_main/$profileId/activity/usage")({
  component: UsageRoute,
});

function UsageRoute() {
  return <AiLogsPanel />;
}
