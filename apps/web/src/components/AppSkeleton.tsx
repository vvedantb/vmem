import { VmemSpinner } from "@/components/svg-animations";

export function AppSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <VmemSpinner size={32} className="text-muted-foreground" />
    </div>
  );
}
