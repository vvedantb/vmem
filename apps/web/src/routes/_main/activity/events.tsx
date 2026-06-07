import { createFileRoute } from "@tanstack/react-router";
import { EventsPanel } from "./-components/EventsPanel";

export const Route = createFileRoute("/_main/activity/events")({
  component: EventsRoute,
});

function EventsRoute() {
  return <EventsPanel />;
}
