import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import {
  AiLogsPanel,
  AiLogsRightSection,
} from "@/components/activity/AiLogsPanel";

export const Route = createFileRoute("/_main/$profileId/usage")({
  component: UsageRoute,
});

function UsageRoute() {
  return (
    <PageContainer
      title="Usage"
      centeredMaxWidth
      noScroll
      rightSection={<AiLogsRightSection />}
    >
      <AiLogsPanel />
    </PageContainer>
  );
}
