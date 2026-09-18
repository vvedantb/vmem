import type { ReactNode } from "react";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import PageContainer from "@/components/shell/PageContainer";
import MemoryListHeaderControls from "@/components/_components/MemoryListHeaderControls";
import GraphHeaderControls from "@/components/_components/GraphHeaderControls";
import { MemoriesSearchUrlSanitizer } from "./-components/MemoriesSearchUrlSanitizer";
import {
  MemoryGraphControllerProvider,
  useMemoryGraphControllerContext,
} from "./-components/MemoryGraphControllerContext";
import { useMemoriesSearchParams } from "@/hooks/useMemoriesSearchParams";

export const Route = createFileRoute("/_main/$profileId/memories")({
  component: MemoriesLayout,
});

function MemoriesPageShell({
  rightSection,
  noScroll,
}: {
  rightSection?: ReactNode;
  noScroll?: boolean;
}) {
  return (
    <PageContainer
      title="Memories"
      showTitle={false}
      rightSection={rightSection}
      noScroll={noScroll}
    >
      <Outlet />
    </PageContainer>
  );
}

function GraphMemoriesLayout() {
  const controller = useMemoryGraphControllerContext();
  return (
    <MemoriesPageShell
      rightSection={<GraphHeaderControls controller={controller} />}
    />
  );
}

function ListMemoriesLayout() {
  return (
    <MemoriesPageShell rightSection={<MemoryListHeaderControls />} noScroll />
  );
}

function TimelineMemoriesLayout() {
  return (
    <MemoriesPageShell
      rightSection={<MemoryListHeaderControls hideViewSwitcher />}
      noScroll
    />
  );
}

function DefaultMemoriesLayout() {
  return <MemoriesPageShell />;
}

function MemoriesLayoutShell() {
  const matchRoute = useMatchRoute();
  if (matchRoute({ to: "/$profileId/memories/graph" })) {
    return <GraphMemoriesLayout />;
  }
  if (matchRoute({ to: "/$profileId/memories/list", fuzzy: true })) {
    return <ListMemoriesLayout />;
  }
  if (matchRoute({ to: "/$profileId/memories/timeline" })) {
    return <TimelineMemoriesLayout />;
  }
  return <DefaultMemoriesLayout />;
}

// Graph/List/Timeline tabs live in the memories sidebar; this layout stays
// mounted across those subroutes so graph controller + URL cleanup persist.
function MemoriesLayout() {
  const matchRoute = useMatchRoute();
  const isGraph = matchRoute({ to: "/$profileId/memories/graph" });
  const [params] = useMemoriesSearchParams();

  return (
    <MemoryGraphControllerProvider
      focusNodeId={params.focus}
      enabled={!!isGraph}
    >
      <MemoriesSearchUrlSanitizer />
      <MemoriesLayoutShell />
    </MemoryGraphControllerProvider>
  );
}
