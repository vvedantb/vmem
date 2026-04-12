"use client";

import type { Memory } from "@/lib/memories";
import RelatedMemories from "./RelatedMemories";

interface ConnectionsTabProps {
  memoryId: string;
  onSelectRelated: (memory: Memory) => void;
}

export default function ConnectionsTab({
  memoryId,
  onSelectRelated,
}: ConnectionsTabProps) {
  return (
    <RelatedMemories memoryId={memoryId} onSelectRelated={onSelectRelated} />
  );
}
