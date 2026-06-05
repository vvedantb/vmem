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
      className={`group flex gap-4 rounded-2xl bg-surface px-4 py-4 transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-surface-secondary sm:px-5 sm:py-4 ${offsetClassName}`}
    >
      <div className="flex shrink-0 flex-col items-center gap-2">
        <span className="font-instrumentSerif text-lg leading-none tabular-nums text-muted/70">
          {label}
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground text-background transition-[transform,background-color] group-hover:scale-105">
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
