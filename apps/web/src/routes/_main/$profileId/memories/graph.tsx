"use client";

import { createFileRoute } from "@tanstack/react-router";
import MemoryGraph from "@/components/MemoryGraph";
import { useMemoryGraphControllerContext } from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";

export const Route = createFileRoute("/_main/$profileId/memories/graph")({
  component: MemoriesGraphPage,
});

function MemoriesGraphPage() {
  const [params, setParams] = useMemoriesSearchParams();
  const graphController = useMemoryGraphControllerContext();

  return (
    <div className="-mb-6 h-full min-h-0 overflow-hidden rounded-lg">
      <MemoryGraph
        controller={graphController}
        focusNodeId={params.focus}
        scope={graphController.scope}
        depth={graphController.depth}
        // Focusing a node implies local scope (scope: null resets to the
        // "local" default, keeping the URL clean); exiting goes global.
        onFocusChange={(id) =>
          id === null
            ? setParams({ focus: null, scope: "global" })
            : setParams({ focus: id, scope: null })
        }
        onDepthChange={(d) => setParams({ depth: d === 2 ? null : d })}
      />
    </div>
  );
}
