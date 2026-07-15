import { useMemo } from "react";
import { buildVersionChain, type TimelineEvent } from "@/lib/timeline";

interface UseVersionChainResult {
  versions: ReturnType<typeof buildVersionChain>;
  totalVersions: number;
  isEmpty: boolean;
}

export function useVersionChain(
  events: TimelineEvent[],
): UseVersionChainResult {
  const versions = useMemo(() => buildVersionChain(events), [events]);

  return {
    versions,
    totalVersions: versions.length,
    isEmpty: versions.length === 0,
  };
}
