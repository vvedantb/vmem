"use client";

import { Skeleton } from "@vmem/ui";

export function ApiLogsLoadingSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="p-6 rounded-xl border border-border bg-muted/50"
          >
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-9 w-24 rounded mt-3" />
          </div>
        ))}
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border bg-muted/50 p-4">
          <div className="flex gap-8">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-4 w-20 rounded hidden md:block" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        </div>
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="p-6 border-b border-border last:border-0">
            <div className="flex items-center gap-8">
              <Skeleton className="h-4 w-56 rounded" />
              <Skeleton className="h-6 w-12 rounded" />
              <Skeleton className="h-4 w-16 rounded hidden md:block" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
