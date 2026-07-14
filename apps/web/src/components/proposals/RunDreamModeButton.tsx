"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@vmem/ui";
import { IconSparkles, IconLoader2 } from "@tabler/icons-react";
import { api } from "@vmem/backend";

// inbox "start dreaming" button — one-shot personal-profile synthesis
export default function RunDreamModeButton() {
  const runDreamForUser = useAction(api.dreamMode.runDreamForUser);
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  async function handleClick() {
    if (isRunning) return;
    setIsRunning(true);
    try {
      const result = await runDreamForUser({});
      switch (result.reason) {
        case "ok": {
          const created = result.proposalsCreated;
          const materialized = result.memoriesMaterialized;
          if (created === 0 && materialized === 0) {
            toast.success(
              `Scanned ${result.clustersScanned} clusters — no new synthesis surfaced`,
            );
          } else {
            const parts: string[] = [];
            if (created > 0) {
              parts.push(`${created} proposal${created === 1 ? "" : "s"}`);
            }
            if (materialized > 0) {
              parts.push(
                `${materialized} auto-accepted ${
                  materialized === 1 ? "memory" : "memories"
                }`,
              );
            }
            toast.success(`Dream Mode: ${parts.join(", ")}`);
          }
          void queryClient.invalidateQueries({ queryKey: ["proposals"] });
          void queryClient.invalidateQueries({ queryKey: ["memories"] });
          break;
        }
        case "no-key":
          toast.error("Set OPENROUTER_API_KEY in settings to use Dream Mode");
          break;
        case "no-recent-memories":
          toast.message(
            "No recent memories to scan — Dream Mode looks at the last 7 days",
          );
          break;
        case "rate-limited":
          toast.message("Dream Mode already ran in the last hour — try later");
          break;
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Dream Mode failed to run",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={() => {
        void handleClick();
      }}
      disabled={isRunning}
      className="gap-1.5"
    >
      {isRunning ? (
        <IconLoader2 size={14} className="animate-spin" />
      ) : (
        <IconSparkles size={14} />
      )}
      {isRunning ? "Dreaming…" : "Start Dreaming"}
    </Button>
  );
}
