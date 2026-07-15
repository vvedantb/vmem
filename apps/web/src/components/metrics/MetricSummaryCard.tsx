import type { ReactNode } from "react";
import type { TablerIcon } from "@tabler/icons-react";
import { motion } from "motion/react";
import { Card, CardContent, cn } from "@vmem/ui";
import { Sparkline } from "@/components/charts/Sparkline";

const CARD_SPACER = <div className="mt-auto" />;

export interface MetricSummaryCardProps {
  label: string;
  value: ReactNode;
  icon: TablerIcon;
  valueClassName?: string;
  trendData?: number[];
  strokeClassName?: string;
  fillClassName?: string;
  showTrend?: boolean;
  index?: number;
  animate?: boolean;
  className?: string;
}

function MetricSummaryCardContent({
  label,
  value,
  icon: Icon,
  valueClassName,
  trendData,
  strokeClassName,
  fillClassName,
  showTrend,
  className,
}: Omit<MetricSummaryCardProps, "index" | "animate">) {
  const showSparkline =
    showTrend !== false &&
    trendData !== undefined &&
    strokeClassName !== undefined;

  return (
    <Card className={cn("h-full shadow-none", className)}>
      <CardContent className="flex min-h-[9.5rem] flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted">{label}</p>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60">
            <Icon size={16} className="text-muted" stroke={1.5} />
          </div>
        </div>
        <p
          className={cn(
            "font-instrumentSerif text-3xl leading-none tabular-nums text-foreground",
            valueClassName,
          )}
        >
          {value}
        </p>
        {showSparkline ? (
          <div className="mt-auto pt-1">
            <Sparkline
              data={trendData}
              strokeClassName={strokeClassName}
              fillClassName={fillClassName}
            />
            <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
          </div>
        ) : (
          CARD_SPACER
        )}
      </CardContent>
    </Card>
  );
}

export function MetricSummaryCard({
  animate = false,
  index = 0,
  ...props
}: MetricSummaryCardProps) {
  const content = <MetricSummaryCardContent {...props} />;

  if (!animate) return content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="h-full"
    >
      {content}
    </motion.div>
  );
}

export function MetricSummaryCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, skeletonIndex) => (
        <Card key={skeletonIndex} className="shadow-none">
          <CardContent className="flex min-h-[9.5rem] flex-col gap-3 p-5">
            <div className="h-16 animate-pulse rounded-lg bg-surface-tertiary/60" />
          </CardContent>
        </Card>
      ))}
    </>
  );
}
