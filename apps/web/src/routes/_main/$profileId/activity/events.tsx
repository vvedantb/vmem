import { createFileRoute } from "@tanstack/react-router";
import { EventsPanel } from "./-components/EventsPanel";

export const Route = createFileRoute("/_main/$profileId/activity/events")({
  component: EventsRoute,
});

function EventsRoute() {
  return <EventsPanel />;
}
