"use client";

import { IconLoader2 } from "@tabler/icons-react";

export function ApiLogsLoadingSkeleton() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <IconLoader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
