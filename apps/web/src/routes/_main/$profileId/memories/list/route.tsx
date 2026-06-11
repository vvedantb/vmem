"use client";

import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import MemorySearch from "@/components/MemorySearch";
import TagsListView from "@/components/_components/TagsListView";
import { useMemoriesSearchParams } from "../useMemoriesSearchParams";

export const Route = createFileRoute("/_main/$profileId/memories/list")({
  component: MemoriesListLayout,
});

function listMemoryIdFromParams(
  params: Record<string, string | undefined>,
): string | null {
  const id = params.id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

/**
 * Tag rows (`?view=tags`) share the list tab but have no per-memory route.
 * Memory rows use child routes (`/` and `/$id`) for the URL only — MemorySearch
 * lives here so it stays mounted across list ↔ detail navigation (no remount flicker).
 */
function MemoriesListLayout() {
  const [params] = useMemoriesSearchParams();
  const routeParams = useParams({ strict: false });
  const memoryId = listMemoryIdFromParams(routeParams);
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
      <MemorySearch memoryId={memoryId} />
      <Outlet />
    </Suspense>
  );
}
