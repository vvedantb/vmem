import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useQueryStates } from "nuqs";
import PageContainer from "@/components/PageContainer";
import MemorySearch from "@/components/MemorySearch";
import MemoryGraph from "@/components/MemoryGraph";
import GraphHeaderControls from "@/components/_components/GraphHeaderControls";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import { useMemoryGraphController } from "@/hooks/useMemoryGraphController";
import { memoriesSearchParams } from "./-searchParams";
import { MemoriesTabs } from "./-components/MemoriesTabs";

export const Route = createFileRoute("/_main/memories/")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const [params, setParams] = useQueryStates(memoriesSearchParams);
  const isListView = params.view === "list";

  // Controller owns graph data + filter/display state so both the canvas and
  // the header popover buttons can consume a single source of truth.
  const graphController = useMemoryGraphController({
    focusNodeId: params.focus,
  });

  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      noScroll={isListView}
      leftSection={<MemoriesTabs currentView={params.view} />}
      rightSection={
        isListView ? (
          <MemoryListHeaderControls />
        ) : (
          <GraphHeaderControls controller={graphController} />
        )
      }
    >
      {isListView ? (
        <Suspense>
          <MemorySearch />
        </Suspense>
      ) : (
        <div className="-mb-6 h-full min-h-0 overflow-hidden rounded-lg">
          <MemoryGraph
            controller={graphController}
            focusNodeId={params.focus}
            onFocusChange={(id) => setParams({ focus: id })}
          />
        </div>
      )}
    </PageContainer>
  );
}
