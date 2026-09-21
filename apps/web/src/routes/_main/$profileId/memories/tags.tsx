import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VmemSpinner } from "@/components/icons/animations";

const TagsListView = lazy(
  () => import("@/components/_components/TagsListView"),
);

export const Route = createFileRoute("/_main/$profileId/memories/tags")({
  component: MemoriesTagsPage,
});

function MemoriesTagsPage() {
  return (
    <div className="h-full min-h-0">
      <Suspense
        fallback={
          <div className="flex h-full min-h-0 items-center justify-center">
            <VmemSpinner size={24} className="text-muted" />
          </div>
        }
      >
        <TagsListView />
      </Suspense>
    </div>
  );
}
