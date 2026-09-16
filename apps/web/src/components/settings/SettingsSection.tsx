import { cn } from "@vmem/ui";

type SettingsSectionBodyVariant = "form" | "list" | "compact";

const BODY_VARIANT_CLASS: Record<SettingsSectionBodyVariant, string> = {
  form: "px-4 py-5",
  list: "divide-y divide-separator/50 p-0",
  compact: "px-4 py-3",
};

interface SettingsSectionProps {
  /** Section heading. Kept short — the description carries the detail. */
  title: React.ReactNode;
  /** Supporting copy shown under the heading. */
  description?: React.ReactNode;
  /** Control pinned to the top-right of the heading, e.g. a switch or link. */
  action?: React.ReactNode;
  /** Controls pinned to a bottom bar, e.g. a Save button. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  /**
   * Body padding contract. Prefer this over freelancing `bodyClassName` padding.
   * - form: default labelled fields
   * - list: edge-to-edge divided rows (`p-0`)
   * - compact: tighter padding for dense controls
   */
  bodyVariant?: SettingsSectionBodyVariant;
  /** Applied to the body wrapper, for one-off layout (grids, etc.). */
  bodyClassName?: string;
  className?: string;
}

/**
 * The single container for a block of settings.
 *
 * Title and description sit on the canvas above the card so they read as a
 * section caption. The card is only the controls (and optional footer).
 * Mirrors Eva `SettingsSection`.
 */
export function SettingsSection({
  title,
  description,
  action,
  footer,
  children,
  bodyVariant = "form",
  bodyClassName,
  className,
}: SettingsSectionProps) {
  const hasBody = children != null;
  const hasCard = hasBody || footer != null;

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="flex items-start justify-between gap-4 px-4">
        <div className="min-w-0">
          <h3 className="text-balance text-sm font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-pretty text-sm leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {hasCard ? (
        <div
          className={cn(
            "rounded-lg bg-surface-card [&_input]:bg-field-background [&_textarea]:bg-field-background [&_[data-slot=select-trigger]]:bg-field-background [&_[role=combobox]]:border-border [&_[role=combobox]]:bg-field-background",
            bodyVariant === "list" && "overflow-hidden",
          )}
        >
          {hasBody ? (
            <div className={cn(BODY_VARIANT_CLASS[bodyVariant], bodyClassName)}>
              {children}
            </div>
          ) : null}
          {footer ? (
            <div className="flex items-center justify-end gap-2 rounded-b-lg bg-surface-secondary px-4 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
