import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { Suspense } from "react";
import MemorySearch from "@/components/memories/MemorySearch";
import TagsListView from "@/components/_components/TagsListView";
import { VmemSpinner } from "@/components/icons/animations";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

// bare Suspense renders NOTHING while suspended — stuck query looks like empty workspace
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

// tag rows (`?view=tags`) share the list tab but have no per-memory route
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
