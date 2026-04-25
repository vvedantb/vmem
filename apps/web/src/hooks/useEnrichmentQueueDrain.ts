"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useAction, useMutation, useQuery } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@vmem/backend";
import { useLocalLLM } from "@/components/contexts/LocalLLMContext";
import { runLocalFullEnrichment } from "@/lib/local-enrichment";

const DRAIN_CAP = 50;

export function useEnrichmentQueueDrain(): void {
  const { isAuthenticated } = useConvexAuth();
  const queryClient = useQueryClient();
  const pending = useQuery(
    api.pendingEnrichment.listPendingEnrichment,
    isAuthenticated ? { limit: 100 } : "skip",
  );
  const { model, engineState } = useLocalLLM();
  const getMemoryAction = useAction(api.memoryApi.getMemory);
  const listRecentForEnrichment = useAction(
    api.memoryApi.listRecentMemoryTitlesForEnrichment,
  );
  const applyEnrichmentAction = useAction(api.memoryApi.applyEnrichment);
  const removePending = useMutation(
    api.pendingEnrichment.removePendingEnrichment,
  );

  const drainingRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (pending === undefined) return;
    if (pending.length === 0) return;
    if (engineState !== "ready" || model === null) return;
    if (drainingRef.current) return;
    if (Date.now() < cooldownUntilRef.current) return;

    drainingRef.current = true;
    const batch = pending.slice(0, DRAIN_CAP);

    void (async () => {
      const started = batch.length;
      toast.info(`Enriching ${String(started)} memories…`);

      let ok = 0;
      for (const row of batch) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        try {
          const mem = await getMemoryAction({ memoryId: row.memoryId });
          if (mem === null) {
            await removePending({ memoryId: row.memoryId });
            continue;
          }
          const existing = await listRecentForEnrichment({
            excludeMemoryId: row.memoryId,
          });
          const parsed = await runLocalFullEnrichment(
            model,
            mem.title,
            mem.content,
            existing,
          );
          if (parsed === null) {
            continue;
          }
          await applyEnrichmentAction({
            memoryId: row.memoryId,
            tags: parsed.tags,
            relatedMemoryIds: parsed.relatedMemoryIds,
            entities: parsed.entities,
          });
          await removePending({ memoryId: row.memoryId });
          ok += 1;
        } catch {
          // keep row for retry
        }
      }

      if (ok > 0) {
        toast.success(`Enriched ${String(ok)} memories`);
      } else if (started > 0) {
        cooldownUntilRef.current = Date.now() + 120_000;
      }
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      drainingRef.current = false;
    })();
  }, [
    isAuthenticated,
    pending,
    engineState,
    model,
    getMemoryAction,
    listRecentForEnrichment,
    applyEnrichmentAction,
    removePending,
    queryClient,
  ]);
}
