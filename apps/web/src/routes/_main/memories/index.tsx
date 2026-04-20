import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useQueryStates } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconTopologyStar3, IconList } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import MemorySearch from "@/components/MemorySearch";
import MemoryGraph from "@/components/MemoryGraph";
import GraphHeaderControls from "@/components/_components/GraphHeaderControls";
import { useMemoryGraphController } from "@/hooks/useMemoryGraphController";
import { memoriesSearchParams } from "./-searchParams";

export const Route = createFileRoute("/_main/memories/")({
  component: MemoriesPage,
});

function ViewTabs({
  value,
  onChange,
}: {
  value: "graph" | "list";
  onChange: (view: "graph" | "list") => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as "graph" | "list")}>
      <TabsList>
        <TabsTrigger value="graph">
          <IconTopologyStar3 size={16} className="mr-1.5" />
          Graph
        </TabsTrigger>
        <TabsTrigger value="list">
          <IconList size={16} className="mr-1.5" />
          List
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

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
      leftSection={
        <ViewTabs
          value={params.view}
          onChange={(view) => setParams({ view })}
        />
      }
      rightSection={
        isListView ? (
          <AddMemoryModal />
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
