import { createFileRoute } from "@tanstack/react-router";
import { AiLogsPanel } from "@/components/activity/AiLogsPanel";

export const Route = createFileRoute("/_main/$profileId/activity/ai-logs")({
  component: AiLogsRoute,
});

function AiLogsRoute() {
  return <AiLogsPanel />;
}
