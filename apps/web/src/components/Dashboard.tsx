import { useState, useEffect, useCallback } from "react";
import { Button } from "@vmem/ui";
import { useConvexAuth, useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "./workspace/active-profile";
import { DashboardLoadingSkeleton } from "./dashboard/DashboardLoadingSkeleton";
import { DashboardStatCards } from "./dashboard/DashboardStatCards";
import { DreamPortraitCard } from "./dashboard/DreamPortraitCard";
import { MemoryGrowthChart } from "./dashboard/MemoryGrowthChart";
import { QuickActionsGrid } from "./dashboard/QuickActionsGrid";
import { RecentActivityList } from "./dashboard/RecentActivityList";

type StatsData = FunctionReturnType<typeof api.dashboardApi.getStats>;
type ActivityItem = FunctionReturnType<
  typeof api.dashboardApi.getRecentActivity
>[number];

export default function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfile = useActiveProfile();
  const getStats = useAction(api.dashboardApi.getStats);
  const getRecentActivity = useAction(api.dashboardApi.getRecentActivity);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setIsLoading(true);
      setError(null);

      const [statsData, activityData] = await Promise.all([
        getStats({ profileId: activeProfile._id }),
        getRecentActivity({ profileId: activeProfile._id }),
      ]);

      setStats(statsData);
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getStats, getRecentActivity, activeProfile._id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <DashboardLoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-danger/10">
          <IconAlertCircle className="h-6 w-6 text-danger" stroke={1.5} />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground text-balance">
          Failed to load dashboard
        </h3>
        <p className="mb-4 text-sm text-muted">{error}</p>
        <Button onClick={fetchData}>
          <IconRefresh size={18} />
          Try again
        </Button>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <DashboardStatCards stats={stats} />

      <DreamPortraitCard />

      <MemoryGrowthChart growthData={stats.growthData} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <RecentActivityList activity={activity} />
        <QuickActionsGrid />
      </div>
    </div>
  );
}
