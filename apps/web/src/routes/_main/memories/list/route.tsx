"use client";

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import TagsListView from "@/components/_components/TagsListView";
import { useMemoriesSearchParams } from "../useMemoriesSearchParams";

export const Route = createFileRoute("/_main/memories/list")({
  component: MemoriesListLayout,
});

/**
 * Tag rows (`?view=tags`) share the list tab but have no per-memory route.
 * Memory rows render through child routes (`/` and `/$id`).
 */
function MemoriesListLayout() {
  const [params] = useMemoriesSearchParams();
  const isTagsView = params.view === "tags";

  if (isTagsView) {
    return (
      <Suspense>
        <TagsListView />
      </Suspense>
    );
  }

  return (
    <Suspense>
      <Outlet />
    </Suspense>
  );
}
