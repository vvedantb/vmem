import type { ReactNode } from "react";

interface DetailSectionProps {
  label: string;
  children: ReactNode;
}

// labelled block for memory detail panel tabs — spacing only, no dividers
export function DetailSection({ label, children }: DetailSectionProps) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium text-muted">{label}</h4>
      {children}
    </section>
  );
}
