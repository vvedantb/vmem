"use client";

import { Card, CardContent, Skeleton } from "@vmem/ui";

export function ApiKeysLoadingSkeleton() {
  return (
    <>
      <Card className="border border-border bg-muted/50 shadow-none">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <Skeleton className="w-10 h-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-32 rounded" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="bg-muted/50 p-4 border-b border-border">
          <div className="flex gap-4">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-4 w-20 rounded" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 border-b border-border">
            <div className="flex items-center gap-4">
              <Skeleton className="h-5 w-28 rounded" />
              <Skeleton className="h-5 w-48 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-8 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
