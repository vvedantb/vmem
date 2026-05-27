import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import { ActivityTabs } from "./-components/ActivityTabs";
import { AiLogsPanel, AiLogsRightSection } from "./-components/AiLogsPanel";

export const Route = createFileRoute("/_main/activity/ai-logs")({
  component: AiLogsRoute,
});

/**
 * `/activity/ai-logs` — observability dashboard for backend LLM/embedding
 * calls. Renders the shared `<ActivityTabs />` so users can swap to Events
 * without losing page chrome.
 *
 * Title is hidden because the tab bar already communicates page identity;
 * mobile topbar still uses it via PageTitleContext.
 */
function AiLogsRoute() {
  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      noScroll
      leftSection={<ActivityTabs />}
      rightSection={<AiLogsRightSection />}
    >
      <AiLogsPanel />
    </PageContainer>
  );
}
