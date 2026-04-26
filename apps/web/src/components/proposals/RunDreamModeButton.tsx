"use client";

import { useCallback, useMemo, useState } from "react";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@vmem/ui";
import { IconLoader2, IconSparkles } from "@tabler/icons-react";
import { api, type Id } from "@vmem/backend";

/**
 * "Run Dream Mode" button rendered in the `/proposals` page header.
 *
 * Triggers a one-shot synthesis pass for the user's default web profile
 * (per V1 spec — only personal profiles can fire manually; team profiles
 * rely on the daily cron). The action is rate-limited to 1 run per 60
 * minutes server-side; we surface the limit reason via toast rather than
 * trying to compute it client-side.
 *
 * Returns a contextual toast based on the action's reason code:
 *   ok                  → "Dream Mode found N proposals" (or "no synthesis")
 *   no-key              → "Set OPENROUTER_API_KEY in settings"
 *   no-recent-memories  → "No recent memories to scan"
 *   rate-limited        → "Already ran in the last hour"
 *
 * Disables itself if no personal profile exists yet (new user, pre-onboarding).
 */
export default function RunDreamModeButton() {
  const { isAuthenticated } = useConvexAuth();
  const profiles = useQuery(api.profiles.list, isAuthenticated ? {} : "skip");
  const defaultWebProfileId = useQuery(
    api.userSettings.getDefaultProfile,
    isAuthenticated ? { source: "web" } : "skip",
  );
  const runDreamForProfile = useAction(api.dreamMode.runDreamForProfile);
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);

  // Prefer the user's web default. If none is set, pick the first personal
  // profile (team profiles can't trigger manually in V1). undefined means
  // the user has no personal profile yet — button stays disabled.
  const targetProfileId = useMemo<Id<"profiles"> | undefined>(() => {
    if (defaultWebProfileId) return defaultWebProfileId;
    if (!profiles) return undefined;
    const personal = profiles.find((p) => p.teamId === undefined);
    return personal?._id;
  }, [defaultWebProfileId, profiles]);

  const handleClick = useCallback(async () => {
    if (!targetProfileId || isRunning) return;
    setIsRunning(true);
    try {
      const result = await runDreamForProfile({ profileId: targetProfileId });
      switch (result.reason) {
        case "ok": {
          const created = result.proposalsCreated;
          const materialized = result.memoriesMaterialized;
          if (created === 0 && materialized === 0) {
            toast.success(
              `Scanned ${String(result.clustersScanned)} clusters — no new synthesis surfaced`,
            );
          } else {
            const parts: string[] = [];
            if (created > 0) {
              parts.push(
                `${String(created)} proposal${created === 1 ? "" : "s"}`,
              );
            }
            if (materialized > 0) {
              parts.push(
                `${String(materialized)} auto-accepted ${
                  materialized === 1 ? "memory" : "memories"
                }`,
              );
            }
            toast.success(`Dream Mode: ${parts.join(", ")}`);
          }
          // Refresh the proposals list so any newly created rows appear
          // without needing a manual reload. Materialized memories will
          // also surface in /memories on its next refetch.
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
  }, [isRunning, queryClient, runDreamForProfile, targetProfileId]);

  const disabled = !targetProfileId || isRunning;

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={handleClick}
      disabled={disabled}
      className="gap-1.5"
    >
      {isRunning ? (
        <IconLoader2 size={14} className="animate-spin" />
      ) : (
        <IconSparkles size={14} />
      )}
      {isRunning ? "Dreaming…" : "Run Dream Mode"}
    </Button>
  );
}
