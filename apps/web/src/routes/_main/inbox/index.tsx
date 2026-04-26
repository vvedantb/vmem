import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import PageContainer from "@/components/PageContainer";
import { inboxSearchParams } from "./-searchParams";
import { InboxTabs } from "./-components/InboxTabs";
import {
  ProposalsPanel,
  ProposalsRightSection,
} from "./-components/ProposalsPanel";
import {
  NotificationsPanel,
  NotificationsRightSection,
} from "./-components/NotificationsPanel";

export const Route = createFileRoute("/_main/inbox/")({
  component: InboxPage,
});

/**
 * `/inbox` — items that need the user's attention. Two tabs: Proposals
 * (synthesis suggestions awaiting review) and Notifications (unread
 * mentions / pings).
 *
 * Each panel ships its own body + right-section component. The
 * orchestrator just owns the `tab` URL param and switches which pair is
 * rendered.
 *
 * Title is hidden on desktop because the tab bar already communicates
 * identity; mobile topbar still uses it via PageTitleContext.
 */
function InboxPage() {
  const [params, setParams] = useQueryStates(inboxSearchParams);

  const rightSection =
    params.tab === "proposals" ? (
      <ProposalsRightSection />
    ) : (
      <NotificationsRightSection />
    );

  return (
    <PageContainer
      title="Inbox"
      showTitle={false}
      centeredMaxWidth
      leftSection={
        <InboxTabs value={params.tab} onChange={(tab) => setParams({ tab })} />
      }
      rightSection={rightSection}
    >
      {params.tab === "proposals" ? <ProposalsPanel /> : <NotificationsPanel />}
    </PageContainer>
  );
}
