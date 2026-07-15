// AI-generated (Claude), prompt: "full screen app boot skeleton with branded spinner"
// Modified by me: centered layout and muted spinner

import { VmemSpinner } from "@/components/icons/animations";

export function AppSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <VmemSpinner size={32} className="text-muted" />
    </div>
  );
}
