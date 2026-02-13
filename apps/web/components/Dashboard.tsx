"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, Skeleton, Button } from "@vmem/ui";
import Link from "next/link";
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
} from "@tabler/icons-react";

interface StatsData {
  totalMemories: number;
  memoriesThisWeek: number;
  memoriesThisMonth: number;
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
    href: "/memories/list",
    icon: IconPlus,
    description: "Create a new memory",
  },
  {
    label: "Search",
    href: "/memories/list",
    icon: IconSearch,
    description: "Find memories",
  },
  {
    label: "Graph View",
    href: "/memories/graph",
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
    href: "/api/keys",
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
  const [stats, setStats] = useState<StatsData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [statsRes, activityRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/dashboard/activity"),
      ]);

      const statsData = await statsRes.json();
      const activityData = await activityRes.json();

      if (!statsRes.ok) {
        throw new Error(statsData.error || "Failed to fetch stats");
      }

      if (!activityRes.ok) {
        throw new Error(activityData.error || "Failed to fetch activity");
      }

      setStats(statsData.data);
      setActivity(activityData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none"
            >
              <CardContent className="p-6">
                <Skeleton className="h-4 w-24 rounded mb-3" />
                <Skeleton className="h-10 w-16 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
          <CardContent className="p-6">
            <Skeleton className="h-5 w-40 rounded mb-6" />
            <Skeleton className="h-48 w-full rounded" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
            <CardContent className="p-6">
              <Skeleton className="h-5 w-32 rounded mb-6" />
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 mb-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 rounded mb-2" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
            <CardContent className="p-6">
              <Skeleton className="h-5 w-28 rounded mb-6" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <IconAlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-lg font-medium text-neutral-800 dark:text-neutral-200 mb-2">
          Failed to load dashboard
        </h3>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          {error}
        </p>
        <Button
          onClick={fetchData}
          className="bg-black dark:bg-white text-white dark:text-black"
        >
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
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat) => (
          <Card
            key={stat.label}
            className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500 uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-3xl font-semibold mt-2 text-black dark:text-white tabular-nums">
                    {stat.value}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                  <stat.icon
                    size={20}
                    className="text-neutral-600 dark:text-neutral-400"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
        <CardContent className="p-6">
          <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
            Memory Growth (Last 7 Days)
          </h3>
          <div className="relative" style={{ height: chartHeight + 40 }}>
            <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-xs text-neutral-400 pr-2">
              <span className="tabular-nums">{maxTotal}</span>
              <span className="tabular-nums">{Math.round(maxTotal / 2)}</span>
              <span className="tabular-nums">0</span>
            </div>

            <div className="ml-8 h-full relative">
              <div className="absolute inset-0 flex flex-col justify-between">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="border-t border-black/5 dark:border-white/5 w-full"
                  />
                ))}
              </div>

              <div
                className="flex items-end justify-between gap-2 h-full pt-2 pb-6"
                style={{ height: chartHeight }}
              >
                {chartData.map((day, index) => {
                  const barHeight = (day.total / maxTotal) * (chartHeight - 30);
                  const newHeight = (day.new / maxTotal) * (chartHeight - 30);

                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full max-w-12 relative group"
                        style={{ height: chartHeight - 30 }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black dark:bg-white text-white dark:text-black text-xs px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                          {day.total} total (+{day.new})
                        </div>

                        <div
                          className="absolute bottom-0 w-full bg-black/10 dark:bg-white/10 rounded-t transition-all"
                          style={{ height: barHeight }}
                        />

                        <div
                          className="absolute bottom-0 w-full bg-black dark:bg-white rounded-t transition-all"
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

              <div className="flex justify-between mt-2">
                {chartData.map((day, index) => (
                  <div
                    key={index}
                    className="flex-1 text-center text-xs text-neutral-500"
                  >
                    {day.date}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4 ml-8">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-neutral-500">Total memories</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-black dark:bg-white" />
              <span className="text-xs text-neutral-500">New that day</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
              Recent Activity
            </h3>
            {activity.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-8">
                No recent activity
              </p>
            ) : (
              <ul className="space-y-4">
                {activity.slice(0, 6).map((item) => {
                  const Icon = getActivityIcon(item.type);
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 py-2 border-b border-black/5 dark:border-white/5 last:border-0"
                    >
                      <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                        <Icon
                          size={16}
                          className="text-neutral-600 dark:text-neutral-400"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-800 dark:text-neutral-200 truncate">
                          {item.description}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
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

        <Card className="border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] shadow-none">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium mb-6 text-black dark:text-white">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map((action) => (
                <Link href={action.href} key={action.label}>
                  <div className="p-4 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors group cursor-pointer">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center group-hover:bg-black/10 dark:group-hover:bg-white/10 transition-colors">
                        <action.icon
                          size={16}
                          className="text-neutral-600 dark:text-neutral-400"
                        />
                      </div>
                      <span className="font-medium text-sm text-neutral-800 dark:text-neutral-200">
                        {action.label}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 pl-11">
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
