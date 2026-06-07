"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import MemorySearch from "@/components/MemorySearch";
import TagsListView from "@/components/_components/TagsListView";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";

export const Route = createFileRoute("/_main/memories/list")({
  component: MemoriesListPage,
});

/**
 * Branches on the `view` URL param: default "memories" renders search/list;
 * `view=tags` renders aggregated tag rows (legacy /memories/tags redirect).
 */
function MemoriesListPage() {
  const [params] = useMemoriesSearchParams();
  const isTagsView = params.view === "tags";

  return (
    <Suspense>{isTagsView ? <TagsListView /> : <MemorySearch />}</Suspense>
  );
}
