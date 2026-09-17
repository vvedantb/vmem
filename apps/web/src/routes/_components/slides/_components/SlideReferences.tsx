import { IconExternalLink } from "@tabler/icons-react";

export interface SlideReference {
  /** Short label shown on the pill. */
  label: string;
  href: string;
}

interface SlideReferencesProps {
  items: SlideReference[];
  /** Extra classes — use `mt-auto` inside SlideShell to pin to the bottom. */
  className?: string;
}

/**
 * Source pills for any slide. Drop inside SlideShell as the last child:
 *
 * ```tsx
 * <SlideReferences
 *   className="mt-auto"
 *   items={[{ label: "…", href: "https://…" }]}
 * />
 * ```
 */
export function SlideReferences({
  items,
  className = "",
}: SlideReferencesProps) {
  if (items.length === 0) return null;

  // Surface tokens support opacity; foreground bg does not (oklch tokens).
  const pillClass =
    "inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1 text-xs font-medium text-muted transition-[background-color,color] hover:bg-surface-tertiary hover:text-foreground";

  return (
    <div
      className={`pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 ${className}`}
    >
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-[0.14em] text-muted">
        Sources
      </span>
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={pillClass}
        >
          {item.label}
          <IconExternalLink size={11} stroke={1.75} className="opacity-50" />
        </a>
      ))}
    </div>
  );
}
