"use client";

import { lazy, Suspense } from "react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "./-components/ActivityTabs";

const AiLogsRightSection = lazy(() =>
  import("./-components/AiLogsPanel").then((m) => ({
    default: m.AiLogsRightSection,
  })),
);
const EventsRightSection = lazy(() =>
  import("./-components/EventsPanel").then((m) => ({
    default: m.EventsRightSection,
  })),
);

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
      rightSection={
        <Suspense fallback={null}>
          {isEvents ? <EventsRightSection /> : <AiLogsRightSection />}
        </Suspense>
      }
    >
      <Outlet />
    </PageContainer>
  );
}
