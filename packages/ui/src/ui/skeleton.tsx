import { cn } from "../utils/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-muted/70", className)}
      {...props}
    />
  );
}

export { Skeleton };
