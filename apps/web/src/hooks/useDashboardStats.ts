import { useAction, useConvexAuth } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vmem/backend";

// One cache entry per profile for api.dashboardApi.getStats. The sidebar
// (fetchQuery), the dashboard and the duplicate-scan dialog share it, so they
// reuse one stats read (in-flight dedupe + 30s staleTime).
export const DASHBOARD_STATS_STALE_MS = 30_000;

export function dashboardStatsQueryKey(
  profileId: string | undefined,
): [string, string | undefined] {
  return ["dashboard-stats", profileId];
}

export function useDashboardStats(profileId: string, enabled = true) {
  const { isAuthenticated } = useConvexAuth();
  const getStats = useAction(api.dashboardApi.getStats);
  return useQuery({
    queryKey: dashboardStatsQueryKey(profileId),
    enabled: isAuthenticated && enabled,
    staleTime: DASHBOARD_STATS_STALE_MS,
    queryFn: async () => await getStats({ profileId }),
  });
}
