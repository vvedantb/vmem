import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import MemorySearch from "@/components/MemorySearch";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import { MemoriesTabs } from "./-components/MemoriesTabs";

export const Route = createFileRoute("/_main/memories/list")({
  component: MemoriesListPage,
});

function MemoriesListPage() {
  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      noScroll
      leftSection={<MemoriesTabs />}
      rightSection={<MemoryListHeaderControls />}
    >
      <Suspense>
        <MemorySearch />
      </Suspense>
    </PageContainer>
  );
}
