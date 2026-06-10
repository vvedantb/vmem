"use client";

import { createFileRoute } from "@tanstack/react-router";
import MemorySearch from "@/components/MemorySearch";

export const Route = createFileRoute("/_main/memories/list/$id")({
  component: MemoriesListDetailPage,
});

function MemoriesListDetailPage() {
  const { id } = Route.useParams();
  return <MemorySearch memoryId={id} />;
}
