"use client";

import { Skeleton } from "@vmem/ui";

export function AiLogsLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {[1, 2, 3, 4].map((index) => (
          <div
            key={index}
            className="flex min-h-[9.5rem] flex-col gap-3 rounded-xl bg-surface-secondary/40 p-5"
          >
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="mt-auto h-10 w-full rounded" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <div className="flex flex-col gap-1">
          {[1, 2, 3, 4, 5, 6].map((index) => (
            <div
              key={index}
              className="rounded-xl bg-surface-secondary/40 px-4 py-3"
            >
              <Skeleton className="h-4 w-full max-w-2xl rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
