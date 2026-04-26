import { useState } from "react";
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
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      scrollRef={setScrollParent}
      leftSection={<ActivityTabs />}
      rightSection={<EventsRightSection />}
    >
      <EventsPanel scrollParent={scrollParent} />
    </PageContainer>
  );
}
