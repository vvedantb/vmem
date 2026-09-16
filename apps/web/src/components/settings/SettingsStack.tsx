import { cn } from "@vmem/ui";

/**
 * Vertical rhythm for every settings page body — one gap, no page-local freelancing.
 * Mirrors Eva `SettingsStack`.
 */
export function SettingsStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-8", className)}>{children}</div>;
}
