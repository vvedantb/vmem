import type { ReactNode } from "react";

export function FilterOptionContent({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex shrink-0 text-muted [&>svg]:size-4">{icon}</span>
      {children}
    </span>
  );
}
