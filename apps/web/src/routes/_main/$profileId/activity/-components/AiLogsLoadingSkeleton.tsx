"use client";

import { Card, CardContent, Skeleton } from "@vmem/ui";

export function AiLogsLoadingSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        {[1, 2, 3, 4].map((index) => (
          <Card key={index} className="shadow-none">
            <CardContent className="flex min-h-[9.5rem] flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20 rounded" />
              <Skeleton className="mt-auto h-10 w-full rounded" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <Card className="flex min-h-0 flex-1 flex-col shadow-none">
          <CardContent className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
            {[1, 2, 3, 4, 5, 6].map((index) => (
              <div key={index} className="rounded-lg px-4 py-3">
                <Skeleton className="h-4 w-full max-w-2xl rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
