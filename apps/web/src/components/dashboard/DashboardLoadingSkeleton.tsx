"use client";

import { Card, CardContent, Skeleton } from "@vmem/ui";

const STAT_CARD_SKELETON_KEYS = [0, 1, 2, 3] as const;

function StatCardSkeleton() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex min-h-[7.5rem] flex-col gap-3 p-5">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <Skeleton className="h-8 w-16 rounded" />
      </CardContent>
    </Card>
  );
}

const CHART_SKELETON = (
  <Card className="shadow-none">
    <CardContent className="p-5 sm:p-6">
      <Skeleton className="mb-6 h-5 w-48 rounded" />
      <Skeleton className="h-44 w-full rounded-lg" />
    </CardContent>
  </Card>
);

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {STAT_CARD_SKELETON_KEYS.map((key) => (
          <StatCardSkeleton key={key} />
        ))}
      </div>

      {CHART_SKELETON}
    </div>
  );
}
