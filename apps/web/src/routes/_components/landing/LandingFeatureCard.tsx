import type { TablerIcon } from "@tabler/icons-react";

interface LandingFeatureCardProps {
  icon: TablerIcon;
  title: string;
  description: string;
}

export function LandingFeatureCard({
  icon: Icon,
  title,
  description,
}: LandingFeatureCardProps) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-secondary/60 px-4 py-3.5 transition-[background-color] hover:bg-surface-tertiary/50">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-tertiary/70">
        <Icon size={18} stroke={1.5} className="text-muted" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}
