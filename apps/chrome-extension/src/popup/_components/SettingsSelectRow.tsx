import type { ReactNode } from "react";

interface SettingsSelectRowProps {
  label: string;
  description?: string;
  children: ReactNode;
}

/** Label + select control row — matches web settings layout. */
export function SettingsSelectRow({
  label,
  description,
  children,
}: SettingsSelectRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-1 text-xs text-muted text-pretty">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
