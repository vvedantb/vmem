"use client";

import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import GraphHeaderControls from "@/components/_components/GraphHeaderControls";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import { MemoriesTabs } from "./-components/MemoriesTabs";
import {
  MemoryGraphControllerProvider,
  useMemoryGraphControllerContext,
} from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";

export const Route = createFileRoute("/_main/$profileId/memories")({
  component: MemoriesLayout,
});

function GraphHeaderSlot() {
  const controller = useMemoryGraphControllerContext();
  return <GraphHeaderControls controller={controller} />;
}

function MemoriesLayoutShell() {
  const matchRoute = useMatchRoute();
  const isGraph = matchRoute({ to: "/$profileId/memories/graph" });
  const isList = matchRoute({ to: "/$profileId/memories/list", fuzzy: true });

  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      leftSection={<MemoriesTabs />}
      rightSection={
        isGraph ? (
          <GraphHeaderSlot />
        ) : isList ? (
          <MemoryListHeaderControls />
        ) : undefined
      }
      noScroll={isList ? true : undefined}
    >
      <Outlet />
    </PageContainer>
  );
}

/**
 * Keeps `MemoriesTabs` mounted across graph/list subroutes so the sliding
 * pill animates. The graph controller provider stays mounted across both
 * subroutes so the graph page never loses its context mid-transition (the
 * `Outlet` and `matchRoute` can briefly disagree during a tab switch). It only
 * fetches graph data while the graph view is active via the `enabled` flag.
 */
function MemoriesLayout() {
  const matchRoute = useMatchRoute();
  const isGraph = matchRoute({ to: "/$profileId/memories/graph" });
  const [params] = useMemoriesSearchParams();

  return (
    <MemoryGraphControllerProvider
      focusNodeId={params.focus}
      enabled={!!isGraph}
    >
      <MemoriesLayoutShell />
    </MemoryGraphControllerProvider>
  );
}
