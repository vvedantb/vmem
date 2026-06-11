"use client";

import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import MemorySearch from "@/components/MemorySearch";
import TagsListView from "@/components/_components/TagsListView";
import { VmemSpinner } from "@/components/svg-animations";
import { useMemoriesSearchParams } from "../useMemoriesSearchParams";

/** A bare Suspense renders NOTHING while suspended — a stuck query then
 *  looks like an empty workspace. Always show the spinner instead. */
const suspenseFallback = (
  <div className="flex h-full min-h-0 items-center justify-center">
    <VmemSpinner size={24} className="text-muted" />
  </div>
);

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
      <Suspense fallback={suspenseFallback}>
        <TagsListView />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={suspenseFallback}>
      <MemorySearch memoryId={memoryId} />
      <Outlet />
    </Suspense>
  );
}
