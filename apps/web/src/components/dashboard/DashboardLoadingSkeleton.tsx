"use client";

import { Card, CardContent, Skeleton } from "@vmem/ui";

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {[1, 2, 3, 4].map((index) => (
          <Card key={index} className="shadow-none">
            <CardContent className="flex min-h-[7.5rem] flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-16 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardContent className="p-5 sm:p-6">
          <Skeleton className="mb-6 h-5 w-48 rounded" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </CardContent>
      </Card>
    </div>
  );
}
