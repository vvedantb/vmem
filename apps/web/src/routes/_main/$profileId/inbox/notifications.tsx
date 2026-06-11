import { createFileRoute } from "@tanstack/react-router";
import { NotificationsPanel } from "./-components/NotificationsPanel";

export const Route = createFileRoute("/_main/$profileId/inbox/notifications")({
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return <NotificationsPanel />;
}
