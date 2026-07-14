import type { ReactNode } from "react";
import { SectionHeading } from "./SectionHeading";

// shared shell for each animation category on /svg-playground
export function PlaygroundSection({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <SectionHeading title={title} blurb={blurb} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
