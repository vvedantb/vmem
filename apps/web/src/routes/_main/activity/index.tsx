import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryStates } from "nuqs";
import PageContainer from "@/components/PageContainer";
import { activitySearchParams } from "./-searchParams";
import { ActivityTabs } from "./-components/ActivityTabs";
import { AiLogsPanel, AiLogsRightSection } from "./-components/AiLogsPanel";
import { EventsPanel, EventsRightSection } from "./-components/EventsPanel";

export const Route = createFileRoute("/_main/activity/")({
  component: ActivityPage,
});

/**
 * `/activity` — unified passive log surface combining what used to be
 * two separate pages: the AI Logs dashboard (formerly `/openrouter-logs`,
 * then briefly `/ai-logs`) and the user-action audit log (formerly
 * `/activity`, then briefly the activity tab inside Inbox).
 *
 * Both are "stuff that happened" — neither requires user action — so they
 * pair naturally as tabs. The orchestrator owns the `tab` URL param + the
 * scroll container (both panels use it via Virtuoso / paginated lists).
 *
 * Title is hidden on desktop because the tab bar in the header already
 * communicates page identity; mobile topbar still uses it via PageTitleContext.
 */
function ActivityPage() {
  const [params, setParams] = useQueryStates(activitySearchParams);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);

  const rightSection =
    params.tab === "ai-logs" ? <AiLogsRightSection /> : <EventsRightSection />;

  return (
    <PageContainer
      title="Activity"
      showTitle={false}
      centeredMaxWidth
      scrollRef={setScrollParent}
      leftSection={
        <ActivityTabs
          value={params.tab}
          onChange={(tab) => setParams({ tab })}
        />
      }
      rightSection={rightSection}
    >
      {params.tab === "ai-logs" ? (
        <AiLogsPanel scrollParent={scrollParent} />
      ) : (
        <EventsPanel scrollParent={scrollParent} />
      )}
    </PageContainer>
  );
}
