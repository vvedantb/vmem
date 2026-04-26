"use client";

import { VmemSpinner } from "@/components/svg-animations";

export function ApiLogsLoadingSkeleton() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <VmemSpinner size={24} className="text-muted-foreground" />
    </div>
  );
}
