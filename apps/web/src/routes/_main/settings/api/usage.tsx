import { createFileRoute } from "@tanstack/react-router";
import { UsagePanel } from "./-components/UsagePanel";

export const Route = createFileRoute("/_main/settings/api/usage")({
  component: UsageRoute,
});

function UsageRoute() {
  return <UsagePanel />;
}
