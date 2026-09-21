import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from "@tanstack/react-router";
import { Suspense } from "react";
import MemorySearch from "@/components/memories/MemorySearch";
import { VmemSpinner } from "@/components/icons/animations";
import { memoriesTagsViewRedirectHref } from "@/lib/url-state/memories";

// bare Suspense renders NOTHING while suspended — stuck query looks like empty workspace
const suspenseFallback = (
  <div className="flex h-full min-h-0 items-center justify-center">
    <VmemSpinner size={24} className="text-muted" />
  </div>
);

export const Route = createFileRoute("/_main/$profileId/memories/list")({
  beforeLoad: ({ params, location }) => {
    const href = memoriesTagsViewRedirectHref(
      params.profileId,
      location.searchStr,
    );
    if (href !== null) {
      throw redirect({ href, replace: true });
    }
  },
  component: MemoriesListLayout,
});

function listMemoryIdFromParams(
  params: Record<string, string | undefined>,
): string | null {
  const id = params.id;
  if (typeof id !== "string" || id.length === 0) return null;
  return id;
}

function MemoriesListLayout() {
  const routeParams = useParams({ strict: false });
  const memoryId = listMemoryIdFromParams(routeParams);

  return (
    <Suspense fallback={suspenseFallback}>
      <MemorySearch memoryId={memoryId} />
      <Outlet />
    </Suspense>
  );
}
