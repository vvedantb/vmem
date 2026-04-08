"use client";

import { Suspense, useState } from "react";
import { useQueryStates } from "nuqs";
import { Input, Tabs, TabsList, TabsTrigger } from "@vmem/ui";
import { IconSearch, IconTopologyStar3, IconList } from "@tabler/icons-react";
import PageContainer from "@/components/PageContainer";
import AddMemoryModal from "@/components/AddMemoryModal";
import MemorySearch from "@/components/MemorySearch";
import MemoryGraph from "@/components/MemoryGraph";
import { memoriesSearchParams } from "./searchParams";

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  return (
    <div className="relative w-full max-w-md">
      <div className="absolute left-3 top-1/2 -translate-y-1/2">
        <IconSearch className="text-muted-foreground" size={16} stroke={1.5} />
      </div>
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search memories..."
        className="h-9 bg-muted/50 border-border pl-9 text-foreground hover:bg-accent focus-visible:border-ring"
      />
    </div>
  );
}

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
  const [searchQuery, setSearchQuery] = useState("");

  const isListView = params.view === "list";

  return (
    <PageContainer
      title="Memories"
      leftSection={
        <ViewTabs
          value={params.view}
          onChange={(view) => setParams({ view })}
        />
      }
      centerSection={
        isListView ? (
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        ) : undefined
      }
      rightSection={isListView ? <AddMemoryModal /> : undefined}
    >
      {isListView ? (
        <Suspense>
          <MemorySearch
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </Suspense>
      ) : (
        <div className="h-full min-h-0 -mb-6">
          <MemoryGraph />
        </div>
      )}
    </PageContainer>
  );
}
