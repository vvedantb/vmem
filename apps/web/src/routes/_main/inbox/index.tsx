import { useState } from "react";
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
import {
  ActivityPanel,
  ActivityRightSection,
} from "./-components/ActivityPanel";

export const Route = createFileRoute("/_main/inbox/")({
  component: InboxPage,
});

/**
 * `/inbox` — unified inbox combining what used to be three separate
 * routes: proposals, notifications, and activity. The merge is purely
 * presentational; each panel still drives its own data sources and
 * filters via independent nuqs params.
 *
 * The orchestrator owns:
 * - the `tab` URL param
 * - the scroll container ref (Activity uses Virtuoso with the page's
 *   scroll surface as its parent)
 * - which `rightSection` is active (each panel ships its own actions)
 */
function InboxPage() {
  const [params, setParams] = useQueryStates(inboxSearchParams);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  const rightSection =
    params.tab === "proposals" ? (
      <ProposalsRightSection />
    ) : params.tab === "notifications" ? (
      <NotificationsRightSection />
    ) : (
      <ActivityRightSection />
    );

  return (
    <PageContainer
      title="Inbox"
      centeredMaxWidth
      scrollRef={setScrollParent}
      leftSection={
        <InboxTabs value={params.tab} onChange={(tab) => setParams({ tab })} />
      }
      rightSection={rightSection}
    >
      {params.tab === "proposals" ? (
        <ProposalsPanel />
      ) : params.tab === "notifications" ? (
        <NotificationsPanel />
      ) : (
        <ActivityPanel scrollParent={scrollParent} />
      )}
    </PageContainer>
  );
}
