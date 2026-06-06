import type { TablerIcon } from "@tabler/icons-react";

interface LandingFeatureCardProps {
  icon: TablerIcon;
  title: string;
  description: string;
  index: number;
  offsetClassName?: string;
}

export function LandingFeatureCard({
  icon: Icon,
  title,
  description,
  index,
  offsetClassName = "",
}: LandingFeatureCardProps) {
  const label = String(index + 1).padStart(2, "0");

  return (
    <div
      className={`group relative flex gap-3 overflow-hidden rounded-2xl bg-surface px-3.5 py-3.5 transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-surface-secondary sm:gap-4 sm:px-5 sm:py-4 ${offsetClassName}`}
    >
      <div
        className="absolute inset-y-3 left-0 w-1 rounded-full bg-foreground/0 transition-[background-color] group-hover:bg-foreground/15"
        aria-hidden
      />
      <div className="flex shrink-0 flex-col items-center gap-2 pl-1">
        <span className="font-instrumentSerif text-lg leading-none tabular-nums text-muted/60 transition-[color] group-hover:text-muted">
          {label}
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-[0.85rem] bg-foreground text-background transition-[transform,background-color] group-hover:scale-[1.04]">
          <Icon size={18} stroke={1.5} />
        </div>
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
