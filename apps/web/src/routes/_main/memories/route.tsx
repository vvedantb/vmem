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

export const Route = createFileRoute("/_main/memories")({
  component: MemoriesLayout,
});

function GraphHeaderSlot() {
  const controller = useMemoryGraphControllerContext();
  return <GraphHeaderControls controller={controller} />;
}

function MemoriesLayoutShell() {
  const matchRoute = useMatchRoute();
  const isGraph = matchRoute({ to: "/memories/graph" });
  const isList = matchRoute({ to: "/memories/list" });

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
 * pill animates. Graph controller lives in a scoped provider only on /graph.
 */
function MemoriesLayout() {
  const matchRoute = useMatchRoute();
  const isGraph = matchRoute({ to: "/memories/graph" });
  const [params] = useMemoriesSearchParams();

  if (isGraph) {
    return (
      <MemoryGraphControllerProvider focusNodeId={params.focus}>
        <MemoriesLayoutShell />
      </MemoryGraphControllerProvider>
    );
  }

  return <MemoriesLayoutShell />;
}
