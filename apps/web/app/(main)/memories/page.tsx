"use client";

import { Suspense } from "react";
import { useQueryStates } from "nuqs";
import { Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconTopologyStar3, IconList } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import MemorySearch from "@/components/MemorySearch";
import MemoryGraph from "@/components/MemoryGraph";
import { memoriesSearchParams } from "./searchParams";

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

export default function MemoriesPage() {
  const [params, setParams] = useQueryStates(memoriesSearchParams);

  const isListView = params.view === "list";

  return (
    <PageContainer
      title="Memories"
      noScroll={isListView}
      leftSection={
        <ViewTabs
          value={params.view}
          onChange={(view) => setParams({ view })}
        />
      }
      rightSection={isListView ? <AddMemoryModal /> : undefined}
    >
      {isListView ? (
        <Suspense>
          <MemorySearch />
        </Suspense>
      ) : (
        <div className="h-full min-h-0 -mb-6">
          <MemoryGraph />
        </div>
      )}
    </PageContainer>
  );
}
