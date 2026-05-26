"use client";

import type { FunctionReturnType } from "convex/server";
import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBrain,
  IconCalendarWeek,
  IconSparkles,
  IconTags,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import { AnimatedCounter } from "../svg-animations";
import { Sparkline } from "./Sparkline";

type StatsData = FunctionReturnType<typeof api.dashboardApi.getStats>;

interface StatCardConfig {
  label: string;
  value: number;
  icon: TablerIcon;
  trendData?: number[];
  strokeClassName?: string;
  fillClassName?: string;
  showSparkline?: boolean;
}

function StatCard({
  label,
  value,
  icon: Icon,
  trendData,
  strokeClassName,
  fillClassName,
  showSparkline,
  index,
}: StatCardConfig & { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: index * 0.06,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="flex min-h-[9.5rem] flex-col gap-3 rounded-lg bg-surface-secondary/40 p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary/60">
          <Icon size={16} className="text-muted" stroke={1.5} />
        </div>
      </div>
      <p className="font-instrumentSerif text-3xl leading-none tabular-nums text-foreground">
        <AnimatedCounter value={value} duration={0.8} />
      </p>
      {showSparkline && trendData && strokeClassName && fillClassName ? (
        <div className="mt-auto pt-1">
          <Sparkline
            data={trendData}
            strokeClassName={strokeClassName}
            fillClassName={fillClassName}
          />
          <p className="mt-1.5 text-[11px] text-muted">Last 7 days</p>
        </div>
      ) : (
        <div className="mt-auto" />
      )}
    </motion.div>
  );
}

interface DashboardStatCardsProps {
  stats: StatsData;
}

export function DashboardStatCards({ stats }: DashboardStatCardsProps) {
  const totalTrend = stats.growthData.map((day) => day.total);
  const newTrend = stats.growthData.map((day) => day.new);

  const cards: StatCardConfig[] = [
    {
      label: "Total memories",
      value: stats.totalMemories,
      icon: IconBrain,
      trendData: totalTrend,
      strokeClassName: "text-foreground/70",
      fillClassName: "fill-foreground/10",
      showSparkline: true,
    },
    {
      label: "Added today",
      value: stats.memoriesAddedToday,
      icon: IconSparkles,
      trendData: newTrend,
      strokeClassName: "text-accent",
      fillClassName: "fill-accent/15",
      showSparkline: true,
    },
    {
      label: "This week",
      value: stats.memoriesThisWeek,
      icon: IconCalendarWeek,
    },
    {
      label: "Tags used",
      value: stats.totalTags,
      icon: IconTags,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      {cards.map((card, index) => (
        <StatCard key={card.label} {...card} index={index} />
      ))}
    </div>
  );
}
