import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VmemSpinner } from "@/components/icons/animations";

const MemoryTimelineSummaryCard = lazy(
  () => import("@/components/memories/MemoryTimelineSummaryCard"),
);
const MemoryTimelineView = lazy(
  () => import("@/components/memories/MemoryTimelineView"),
);

export const Route = createFileRoute("/_main/$profileId/memories/timeline")({
  component: MemoriesTimelinePage,
});

function MemoriesTimelinePage() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Suspense
        fallback={
          <div className="flex h-full min-h-0 items-center justify-center">
            <VmemSpinner size={24} className="text-muted" />
          </div>
        }
      >
        <MemoryTimelineSummaryCard />
        <div className="min-h-0 flex-1">
          <MemoryTimelineView />
        </div>
      </Suspense>
    </div>
  );
}
