import { Button } from "@vmem/ui";
import { useConvexAuth, useAction } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { api } from "@vmem/backend";
import { useActiveProfile } from "@/components/workspace/active-profile";
import { DashboardLoadingSkeleton } from "./DashboardLoadingSkeleton";
import { DashboardStatCards } from "./DashboardStatCards";
import { DreamPortraitCard } from "./DreamPortraitCard";
import { MemoryGrowthChart } from "./MemoryGrowthChart";

export default function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
  const activeProfile = useActiveProfile();
  const getStats = useAction(api.dashboardApi.getStats);

  const statsQuery = useTanstackQuery({
    queryKey: ["dashboard-stats", activeProfile._id],
    enabled: isAuthenticated,
    staleTime: 30_000,
    queryFn: async () => getStats({ profileId: activeProfile._id }),
  });

  if (statsQuery.isLoading) {
    return <DashboardLoadingSkeleton />;
  }

  if (statsQuery.isError) {
    const error =
      statsQuery.error instanceof Error
        ? statsQuery.error.message
        : "Failed to load dashboard";
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-danger/10">
          <IconAlertCircle className="h-6 w-6 text-danger" stroke={1.5} />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground text-balance">
          Failed to load dashboard
        </h3>
        <p className="mb-4 text-sm text-muted">{error}</p>
        <Button
          onClick={() => {
            void statsQuery.refetch();
          }}
        >
          <IconRefresh size={18} />
          Try again
        </Button>
      </div>
    );
  }

  const stats = statsQuery.data;
  if (!stats) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <DashboardStatCards stats={stats} />

      <DreamPortraitCard />

      <MemoryGrowthChart growthData={stats.growthData} />
    </div>
  );
}
