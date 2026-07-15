import type { TablerIcon } from "@tabler/icons-react";
import {
  IconBrain,
  IconCalendarWeek,
  IconSparkles,
  IconTags,
} from "@tabler/icons-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@vmem/backend";
import { AnimatedCounter } from "../icons/animations";
import { MetricSummaryCard } from "@/components/metrics/MetricSummaryCard";

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

export function DashboardStatCards({
  stats,
}: {
  stats: FunctionReturnType<typeof api.dashboardApi.getStats>;
}) {
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
      {cards.map((card, index) => (
        <MetricSummaryCard
          key={card.label}
          label={card.label}
          value={<AnimatedCounter value={card.value} duration={0.8} />}
          icon={card.icon}
          index={index}
          animate
          trendData={card.kind === "trend" ? card.trendData : undefined}
          strokeClassName={
            card.kind === "trend" ? card.strokeClassName : undefined
          }
        />
      ))}
    </div>
  );
}
