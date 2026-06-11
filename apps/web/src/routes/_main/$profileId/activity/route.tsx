"use client";

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "./-components/ActivityTabs";
import { AiLogsRightSection } from "./-components/AiLogsPanel";
import { EventsRightSection } from "./-components/EventsPanel";

export const Route = createFileRoute("/_main/$profileId/activity")({
  component: ActivityLayout,
});

/**
 * Shared activity shell — keeps `ActivityTabs` mounted across AI Logs /
 * Events subroutes so the sliding tab pill can animate instead of snapping
 * on every navigation.
 */
function ActivityLayout() {
  const matchRoute = useMatchRoute();
  const isEvents = matchRoute({ to: "/$profileId/activity/events" });

  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ActivityTabs />}
      rightSection={isEvents ? <EventsRightSection /> : <AiLogsRightSection />}
    >
      <Outlet />
    </PageContainer>
  );
}
