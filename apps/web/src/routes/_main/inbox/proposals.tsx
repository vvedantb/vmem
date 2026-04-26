import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { InboxTabs } from "./-components/InboxTabs";
import {
  ProposalsPanel,
  ProposalsRightSection,
} from "./-components/ProposalsPanel";

export const Route = createFileRoute("/_main/inbox/proposals")({
  component: ProposalsRoute,
});

/**
 * `/inbox/proposals` — synthesis suggestions awaiting user review.
 * Self-contained subroute that renders the shared `<InboxTabs />` in the
 * page header.
 */
function ProposalsRoute() {
  return (
    <PageContainer
      title="Inbox"
      showTitle={false}
      centeredMaxWidth
      leftSection={<InboxTabs />}
      rightSection={<ProposalsRightSection />}
    >
      <ProposalsPanel />
    </PageContainer>
  );
}
