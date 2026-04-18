"use client";

import { useEnrichmentQueueDrain } from "@/hooks/useEnrichmentQueueDrain";

export function PendingEnrichmentRunner() {
  useEnrichmentQueueDrain();
  return null;
}
