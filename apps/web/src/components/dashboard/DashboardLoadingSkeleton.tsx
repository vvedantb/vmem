"use client";

import { Skeleton } from "@vmem/ui";

export function DashboardLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="flex min-h-[7.5rem] flex-col gap-3 rounded-lg bg-surface-secondary p-5"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-surface-secondary p-5 sm:p-6">
        <Skeleton className="mb-6 h-5 w-48 rounded" />
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {[1, 2].map((index) => (
          <div
            key={index}
            className="rounded-lg bg-surface-secondary p-5 sm:p-6"
          >
            <Skeleton className="mb-4 h-5 w-36 rounded" />
            <div className="flex flex-col gap-1">
              {[1, 2, 3, 4].map((row) => (
                <div
                  key={row}
                  className="rounded-lg bg-surface-secondary/30 px-4 py-3"
                >
                  <Skeleton className="h-4 w-full max-w-sm rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
