import type { ReactNode } from "react";

function PlaygroundSectionFrame({ children }: { children: ReactNode }) {
  return <section className="space-y-4">{children}</section>;
}

function PlaygroundSectionHeading({
  title,
  blurb,
}: {
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <p className="text-sm text-muted">{blurb}</p>
    </div>
  );
}

function PlaygroundSectionGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

// shared shell for each animation category on /svg-playground
export const PlaygroundSection = Object.assign(PlaygroundSectionFrame, {
  Heading: PlaygroundSectionHeading,
  Grid: PlaygroundSectionGrid,
});
