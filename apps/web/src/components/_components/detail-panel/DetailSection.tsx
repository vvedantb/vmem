import type { ReactNode } from "react";

interface DetailSectionProps {
  label: string;
  children: ReactNode;
}

/** Labeled block for memory detail panel tabs — spacing only, no dividers. */
export function DetailSection({ label, children }: DetailSectionProps) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </h4>
      {children}
    </section>
  );
}
