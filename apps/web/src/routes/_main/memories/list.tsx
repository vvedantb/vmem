import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { useQueryStates } from "nuqs";
import PageContainer from "@/components/PageContainer";
import MemorySearch from "@/components/MemorySearch";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import TagsListView from "@/components/_components/TagsListView";
import { MemoriesTabs } from "./-components/MemoriesTabs";
import { memoriesSearchParams } from "./-searchParams";

export const Route = createFileRoute("/_main/memories/list")({
  component: MemoriesListPage,
});

/**
 * Branches on the `view` URL param: the default "memories" view renders the
 * unified search/list (memories + wiki + skills); "tags" renders the
 * aggregated tag rows that previously lived at /memories/tags. Branching at
 * the route keeps each child a pure renderer — neither has to noop its
 * hooks based on the other's view.
 */
function MemoriesListPage() {
  const [params] = useQueryStates(memoriesSearchParams);
  const isTagsView = params.view === "tags";

  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      noScroll
      leftSection={<MemoriesTabs />}
      rightSection={<MemoryListHeaderControls />}
    >
      <Suspense>{isTagsView ? <TagsListView /> : <MemorySearch />}</Suspense>
    </PageContainer>
  );
}
