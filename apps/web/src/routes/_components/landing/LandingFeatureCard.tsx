import type { TablerIcon } from "@tabler/icons-react";

export interface LandingFeature {
  icon: TablerIcon;
  title: string;
  description: string;
}

export function LandingFeatureCard({
  icon: Icon,
  title,
  description,
}: LandingFeature) {
  return (
    <div className="group relative flex gap-3 overflow-hidden rounded-2xl bg-surface px-3.5 py-3.5 transition-[transform,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-surface-secondary sm:gap-4 sm:px-5 sm:py-4">
      <div
        className="absolute inset-y-3 left-0 w-1 rounded-full bg-foreground/0 transition-[background-color] duration-200 group-hover:bg-foreground/15"
        aria-hidden
      />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-transform duration-200 ease-out group-hover:scale-[1.04]">
        <Icon size={18} stroke={1.5} />
      </div>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-pretty text-xs leading-relaxed text-muted sm:text-[0.8125rem]">
          {description}
        </p>
      </div>
    </div>
  );
}
