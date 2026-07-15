import type { ReactNode } from "react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { InboxTabs } from "./-components/InboxTabs";
import { NotificationsRightSection } from "./-components/NotificationsPanel";
import { ProposalsRightSection } from "./-components/ProposalsPanel";

export const Route = createFileRoute("/_main/$profileId/inbox")({
  component: InboxLayout,
});

function InboxShell({ rightSection }: { rightSection: ReactNode }) {
  return (
    <PageContainer
      title="Inbox"
      showTitle={false}
      centeredMaxWidth
      leftSection={<InboxTabs />}
      rightSection={rightSection}
    >
      <Outlet />
    </PageContainer>
  );
}

function InboxNotificationsLayout() {
  return <InboxShell rightSection={<NotificationsRightSection />} />;
}

function InboxProposalsLayout() {
  return <InboxShell rightSection={<ProposalsRightSection />} />;
}

function InboxLayout() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/$profileId/inbox/notifications" })) {
    return <InboxNotificationsLayout />;
  }
  return <InboxProposalsLayout />;
}
