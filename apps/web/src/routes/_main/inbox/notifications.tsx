import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { InboxTabs } from "./-components/InboxTabs";
import {
  NotificationsPanel,
  NotificationsRightSection,
} from "./-components/NotificationsPanel";

export const Route = createFileRoute("/_main/inbox/notifications")({
  component: NotificationsRoute,
});

/**
 * `/inbox/notifications` — unread mentions / pings. Self-contained
 * subroute mirroring `proposals.tsx`.
 */
function NotificationsRoute() {
  return (
    <PageContainer
      title="Inbox"
      showTitle={false}
      centeredMaxWidth
      leftSection={<InboxTabs />}
      rightSection={<NotificationsRightSection />}
    >
      <NotificationsPanel />
    </PageContainer>
  );
}
