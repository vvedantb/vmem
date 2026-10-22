import { createFileRoute, Outlet } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import { NotificationsRightSection } from "./-components/NotificationsPanel";

// `/inbox` is notifications only. Proposals live on the Dreaming page.
export const Route = createFileRoute("/_main/$profileId/inbox")({
  component: InboxLayout,
});

function InboxLayout() {
  return (
    <PageContainer
      title="Inbox"
      showTitle
      centeredMaxWidth
      insetHeader
      rightSection={<NotificationsRightSection />}
    >
      <Outlet />
    </PageContainer>
  );
}
