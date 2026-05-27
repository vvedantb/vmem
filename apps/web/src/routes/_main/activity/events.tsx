import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "./-components/ActivityTabs";
import { EventsPanel, EventsRightSection } from "./-components/EventsPanel";

export const Route = createFileRoute("/_main/activity/events")({
  component: EventsRoute,
});

/**
 * `/activity/events` — user-action audit log (memory created, file
 * uploaded, sync completed, etc.). Self-contained subroute mirroring
 * `ai-logs.tsx`.
 */
function EventsRoute() {
  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ActivityTabs />}
      rightSection={<EventsRightSection />}
    >
      <EventsPanel />
    </PageContainer>
  );
}
