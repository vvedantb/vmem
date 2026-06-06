"use client";

import { createFileRoute } from "@tanstack/react-router";
import MemoryGraph from "@/components/MemoryGraph";
import { useMemoryGraphControllerContext } from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";

export const Route = createFileRoute("/_main/memories/graph")({
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
        onFocusChange={(id) => setParams({ focus: id ?? null })}
      />
    </div>
  );
}
