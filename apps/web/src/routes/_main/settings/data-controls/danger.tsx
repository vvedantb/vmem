import { createFileRoute } from "@tanstack/react-router";
import { DangerZonePanel } from "./-components/DangerZonePanel";

export const Route = createFileRoute("/_main/settings/data-controls/danger")({
  component: DangerRoute,
});

function DangerRoute() {
  return <DangerZonePanel />;
}
