import { cn } from "@vmem/ui";

interface SettingsToggleRowProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  action: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

/**
 * One preference row inside a `SettingsSection` with `bodyVariant="list"`.
 * Put rows as direct children — the section owns the dividers.
 * Mirrors Eva `SettingsToggleRow`.
 */
export function SettingsToggleRow({
  title,
  description,
  action,
  htmlFor,
  className,
}: SettingsToggleRowProps) {
  const titleClassName =
    "text-sm font-medium max-sm:break-words text-foreground";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={titleClassName}>
            {title}
          </label>
        ) : (
          <p className={titleClassName}>{title}</p>
        )}
        {description ? (
          <p className="mt-1 text-pretty text-xs leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-10 shrink-0 items-center">{action}</div>
    </div>
  );
}
