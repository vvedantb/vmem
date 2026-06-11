"use client";

import { createFileRoute } from "@tanstack/react-router";
import MemorySearch from "@/components/MemorySearch";

export const Route = createFileRoute("/_main/$profileId/memories/list/")({
  component: MemoriesListIndexPage,
});

function MemoriesListIndexPage() {
  return <MemorySearch memoryId={null} />;
}
