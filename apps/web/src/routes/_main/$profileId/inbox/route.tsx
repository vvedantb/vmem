"use client";

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { InboxTabs } from "./-components/InboxTabs";
import { NotificationsRightSection } from "./-components/NotificationsPanel";
import { ProposalsRightSection } from "./-components/ProposalsPanel";

export const Route = createFileRoute("/_main/$profileId/inbox")({
  component: InboxLayout,
});

function InboxLayout() {
  const matchRoute = useMatchRoute();
  const isNotifications = matchRoute({ to: "/$profileId/inbox/notifications" });

  return (
    <PageContainer
      title="Inbox"
      showTitle={false}
      centeredMaxWidth
      leftSection={<InboxTabs />}
      rightSection={
        isNotifications ? (
          <NotificationsRightSection />
        ) : (
          <ProposalsRightSection />
        )
      }
    >
      <Outlet />
    </PageContainer>
  );
}
