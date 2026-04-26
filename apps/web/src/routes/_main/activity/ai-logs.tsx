import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "./-components/ActivityTabs";
import { AiLogsPanel, AiLogsRightSection } from "./-components/AiLogsPanel";

export const Route = createFileRoute("/_main/activity/ai-logs")({
  component: AiLogsRoute,
});

/**
 * `/activity/ai-logs` — observability dashboard for backend LLM/embedding
 * calls. Self-contained subroute: owns its scroll container and renders
 * the shared `<ActivityTabs />` so users can swap to Events without losing
 * page chrome.
 *
 * Title is hidden because the tab bar already communicates page identity;
 * mobile topbar still uses it via PageTitleContext.
 */
function AiLogsRoute() {
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      scrollRef={setScrollParent}
      leftSection={<ActivityTabs />}
      rightSection={<AiLogsRightSection />}
    >
      <AiLogsPanel scrollParent={scrollParent} />
    </PageContainer>
  );
}
