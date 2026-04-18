export function AppSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-20 w-20 animate-pulse rounded-2xl bg-muted" />
        <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}
