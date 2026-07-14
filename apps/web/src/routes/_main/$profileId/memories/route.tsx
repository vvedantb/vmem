"use client";

import { lazy, Suspense } from "react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/PageContainer";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import { MemoriesTabs } from "./-components/MemoriesTabs";
import {
  MemoryGraphControllerProvider,
  useMemoryGraphControllerContext,
} from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "./useMemoriesSearchParams";

const GraphHeaderControls = lazy(
  () => import("@/components/_components/GraphHeaderControls"),
);

export const Route = createFileRoute("/_main/$profileId/memories")({
  component: MemoriesLayout,
});

function GraphHeaderSlot() {
  const controller = useMemoryGraphControllerContext();
  return (
    <Suspense fallback={null}>
      <GraphHeaderControls controller={controller} />
    </Suspense>
  );
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

// keeps `MemoriesTabs` mounted across graph/list subroutes so the sliding pill animates
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
