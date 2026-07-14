"use client";

import type { ReactNode } from "react";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBrain,
  IconCalendarWeek,
  IconSparkles,
  IconTags,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { Card, CardContent } from "@vmem/ui";
import { AnimatedCounter } from "../svg-animations";
import { Sparkline } from "./Sparkline";
import type { DashboardStats } from "./_utils";

const STAT_CARD_SPACER = <div className="mt-auto" />;

type StatCardBaseProps = {
  label: string;
  value: number;
  icon: TablerIcon;
  index: number;
  footer: ReactNode;
};

function StatCardBase({
  label,
  value,
  icon: Icon,
  index,
  footer,
}: StatCardBaseProps) {
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
      <Card className="h-full shadow-none">
        <CardContent className="flex min-h-[9.5rem] flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">{label}</p>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60">
              <Icon size={16} className="text-muted" stroke={1.5} />
            </div>
          </div>
          <p className="font-instrumentSerif text-3xl leading-none tabular-nums text-foreground">
            <AnimatedCounter value={value} duration={0.8} />
          </p>
          {footer}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function TrendStatCard({
  label,
  value,
  icon,
  index,
  trendData,
  strokeClassName,
}: Omit<StatCardBaseProps, "footer"> & {
  trendData: number[];
  strokeClassName: string;
}) {
  return (
    <StatCardBase
      label={label}
      value={value}
      icon={icon}
      index={index}
      footer={
        <div className="mt-auto pt-1">
          <Sparkline data={trendData} strokeClassName={strokeClassName} />
          <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
        </div>
      }
    />
  );
}

function SimpleStatCard({
  label,
  value,
  icon,
  index,
}: Omit<StatCardBaseProps, "footer">) {
  return (
    <StatCardBase
      label={label}
      value={value}
      icon={icon}
      index={index}
      footer={STAT_CARD_SPACER}
    />
  );
}

type StatCardConfig =
  | {
      kind: "trend";
      label: string;
      value: number;
      icon: TablerIcon;
      trendData: number[];
      strokeClassName: string;
    }
  | {
      kind: "simple";
      label: string;
      value: number;
      icon: TablerIcon;
    };

export function DashboardStatCards({ stats }: { stats: DashboardStats }) {
  const totalTrend = stats.growthData.map((day) => day.total);
  const newTrend = stats.growthData.map((day) => day.new);

  const cards: StatCardConfig[] = [
    {
      kind: "trend",
      label: "Total memories",
      value: stats.totalMemories,
      icon: IconBrain,
      trendData: totalTrend,
      strokeClassName: "text-foreground/70",
    },
    {
      kind: "trend",
      label: "Added today",
      value: stats.memoriesAddedToday,
      icon: IconSparkles,
      trendData: newTrend,
      strokeClassName: "text-accent",
    },
    {
      kind: "simple",
      label: "This week",
      value: stats.memoriesThisWeek,
      icon: IconCalendarWeek,
    },
    {
      kind: "simple",
      label: "Tags used",
      value: stats.totalTags,
      icon: IconTags,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      {cards.map((card, index) =>
        card.kind === "trend" ? (
          <TrendStatCard key={card.label} {...card} index={index} />
        ) : (
          <SimpleStatCard key={card.label} {...card} index={index} />
        ),
      )}
    </div>
  );
}
