import { createFileRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import MemoryGraph from "@/components/MemoryGraph";
import GraphHeaderControls from "@/components/_components/GraphHeaderControls";
import { useMemoryGraphController } from "@/hooks/useMemoryGraphController";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";
import { MemoriesTabs } from "./-components/MemoriesTabs";

export const Route = createFileRoute("/_main/memories/graph")({
  component: MemoriesGraphPage,
});

function MemoriesGraphPage() {
  const [params, setParams] = useMemoriesSearchParams();

  // Controller owns graph data + filter/display state so both the canvas and
  // the header popover buttons can consume a single source of truth.
  const graphController = useMemoryGraphController({
    focusNodeId: params.focus,
  });

  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      leftSection={<MemoriesTabs />}
      rightSection={<GraphHeaderControls controller={graphController} />}
    >
      <div className="-mb-6 h-full min-h-0 overflow-hidden rounded-lg">
        <MemoryGraph
          controller={graphController}
          focusNodeId={params.focus}
          onFocusChange={(id) => setParams({ focus: id ?? null })}
        />
      </div>
    </PageContainer>
  );
}
