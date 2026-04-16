"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, Button } from "@vmem/ui";
import Link from "next/link";
import { useConvexAuth, useAction } from "convex/react";
import {
  IconBrain,
  IconCalendarWeek,
  IconTags,
  IconPlus,
  IconSearch,
  IconNetwork,
  IconKey,
  IconFileText,
  IconMessage,
  IconAlertCircle,
  IconRefresh,
  IconUpload,
  IconPlugConnected,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react";
import { AnimatedCounter } from "./svg-animations";
import { api } from "@vmem/backend";

interface StatsData {
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
  memoriesAddedToday: number;
  totalTags: number;
  growthData: { date: string; total: number; new: number }[];
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  relativeTime: string;
}

const quickActions = [
  {
    label: "Add Memory",
    href: "/memories?view=list",
    icon: IconPlus,
    description: "Create a new memory",
  },
  {
    label: "Search",
    href: "/memories?view=list",
    icon: IconSearch,
    description: "Find memories",
  },
  {
    label: "Graph View",
    href: "/memories",
    icon: IconNetwork,
    description: "Visualize connections",
  },
  {
    label: "Chat",
    href: "/chat",
    icon: IconMessage,
    description: "Query your memories",
  },
  {
    label: "Files",
    href: "/files",
    icon: IconFileText,
    description: "Manage uploads",
  },
  {
    label: "API Keys",
    href: "/settings/api-keys",
    icon: IconKey,
    description: "Manage access",
  },
];

function getActivityIcon(type: string) {
  switch (type) {
    case "memory_created":
    case "memory_updated":
      return IconBrain;
    case "file_uploaded":
      return IconUpload;
    case "sync_completed":
      return IconPlugConnected;
    case "api_key_created":
      return IconKey;
    default:
      return IconCheck;
  }
}

export default function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
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
        getStats({}),
        getRecentActivity({}),
      ]);

      setStats(statsData as StatsData);
      setActivity(activityData as ActivityItem[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, getStats, getRecentActivity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <IconAlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">
          Failed to load dashboard
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">{error}</p>
        <Button onClick={fetchData}>
          <IconRefresh size={18} />
          Try again
        </Button>
      </div>
    );
  }

  const statsCards = [
    {
      label: "Total Memories",
      value: stats?.totalMemories ?? 0,
      icon: IconBrain,
    },
    {
      label: "This Week",
      value: stats?.memoriesThisWeek ?? 0,
      icon: IconCalendarWeek,
    },
    {
      label: "This Month",
      value: stats?.memoriesThisMonth ?? 0,
      icon: IconCalendarWeek,
    },
    {
      label: "Tags Used",
      value: stats?.totalTags ?? 0,
      icon: IconTags,
    },
  ];

  const chartData = stats?.growthData ?? [];
  const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
  const chartHeight = 180;

  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card
            key={stat.label}
            className="border-0 bg-secondary/50 transition-[transform,background-color] duration-200 ease-smooth hover:-translate-y-0.5 hover:bg-secondary/70"
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-semibold tabular-nums text-foreground">
                    <AnimatedCounter value={stat.value} duration={0.8} />
                  </p>
                </div>
                <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-background/60">
                  <stat.icon size={20} className="text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 bg-secondary/50">
        <CardContent className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-medium mb-4 sm:mb-6 text-foreground">
            Memory Growth (Last 7 Days)
          </h3>
          <div className="relative" style={{ height: chartHeight + 40 }}>
            <div className="absolute left-0 top-0 flex h-full flex-col justify-between pr-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{maxTotal}</span>
              <span className="tabular-nums">{Math.round(maxTotal / 2)}</span>
              <span className="tabular-nums">0</span>
            </div>

            <div className="relative ml-8 h-full">
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-full border-t border-border/65" />
                ))}
              </div>

              <div
                className="flex h-full items-end justify-between gap-2"
                style={{ height: chartHeight }}
              >
                {chartData.map((day, index) => {
                  const barHeight = (day.total / maxTotal) * (chartHeight - 30);
                  const newHeight = (day.new / maxTotal) * (chartHeight - 30);

                  return (
                    <div
                      key={index}
                      className="flex flex-1 flex-col items-center gap-1"
                    >
                      <div
                        className="group relative w-full max-w-12"
                        style={{ height: chartHeight - 30 }}
                      >
                        <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap glass-panel rounded-full px-2 py-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          {day.total} total (+{day.new})
                        </div>

                        <div
                          className="absolute bottom-0 w-full rounded-t-xl bg-secondary transition-all"
                          style={{ height: barHeight }}
                        />

                        <div
                          className="absolute bottom-0 w-full rounded-t-xl bg-primary transition-all"
                          style={{
                            height: newHeight,
                            opacity: day.new > 0 ? 1 : 0,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex justify-between">
                {chartData.map((day, index) => (
                  <div
                    key={index}
                    className="flex-1 text-center text-xs text-muted-foreground"
                  >
                    {day.date}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ml-8 mt-3 sm:mt-4 flex items-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-secondary" />
              <span className="text-xs text-muted-foreground">
                Total memories
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-primary" />
              <span className="text-xs text-muted-foreground">
                New that day
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 sm:gap-7 lg:grid-cols-2">
        <Card className="border-0 bg-secondary/50">
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium mb-4 sm:mb-6 text-foreground">
              Recent Activity
            </h3>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recent activity
              </p>
            ) : (
              <ul className="space-y-2">
                {activity.slice(0, 6).map((item) => {
                  const Icon = getActivityIcon(item.type);
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-xl bg-background/60 px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary">
                        <Icon size={16} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.title} &middot; {item.relativeTime}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 bg-secondary/50">
          <CardContent className="p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-medium mb-4 sm:mb-6 text-foreground">
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Link href={action.href} key={action.label}>
                  <div className="group cursor-pointer rounded-2xl bg-background/60 p-4 transition-[transform,background-color] duration-200 ease-smooth hover:-translate-y-0.5 hover:bg-background/80">
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary transition-colors group-hover:bg-secondary/80">
                        <action.icon
                          size={16}
                          className="text-muted-foreground"
                        />
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {action.label}
                      </span>
                    </div>
                    <p className="pl-11 text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
