"use client";

import type { ReactNode } from "react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "@/components/activity/ActivityTabs";
import { AiLogsRightSection } from "@/components/activity/AiLogsPanel";
import { EventsRightSection } from "@/components/activity/EventsPanel";

export const Route = createFileRoute("/_main/$profileId/activity")({
  component: ActivityLayout,
});

function ActivityShell({ rightSection }: { rightSection: ReactNode }) {
  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ActivityTabs />}
      rightSection={rightSection}
    >
      <Outlet />
    </PageContainer>
  );
}

function ActivityEventsLayout() {
  return <ActivityShell rightSection={<EventsRightSection />} />;
}

function ActivityAiLogsLayout() {
  return <ActivityShell rightSection={<AiLogsRightSection />} />;
}

function ActivityLayout() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/$profileId/activity/events" })) {
    return <ActivityEventsLayout />;
  }
  return <ActivityAiLogsLayout />;
}
