import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { VmemSpinner } from "@/components/icons/animations";
import { useMemoryGraphControllerContext } from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

const MemoryGraph = lazy(() => import("@/components/MemoryGraph"));

export const Route = createFileRoute("/_main/$profileId/memories/graph")({
  component: MemoriesGraphPage,
});

function MemoriesGraphPage() {
  const [params, setParams] = useMemoriesSearchParams();
  const graphController = useMemoryGraphControllerContext();

  return (
    <div className="-mb-6 h-full min-h-0 overflow-hidden rounded-lg">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center">
            <VmemSpinner size={24} className="text-muted" />
          </div>
        }
      >
        <MemoryGraph
          controller={graphController}
          focusNodeId={params.focus}
          scope={graphController.scope}
          // focusing a node implies local scope (scope: null resets to the
          // "local" default, keeping the URL clean); exiting goes global
          onFocusChange={(id) =>
            id === null
              ? setParams({ focus: null, scope: "global" })
              : setParams({ focus: id, scope: null })
          }
        />
      </Suspense>
    </div>
  );
}
