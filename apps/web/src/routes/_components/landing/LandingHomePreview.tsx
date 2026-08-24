import {
  IconBrain,
  IconCalendarWeek,
  IconMoonStars,
  IconSparkles,
  IconTags,
} from "@tabler/icons-react";
import { Card, CardContent } from "@vmem/ui";
import { AnimatedCounter } from "@/components/icons/animations";
import { MetricSummaryCard } from "@/components/metrics/MetricSummaryCard";
import { demoDashboard } from "./landing-preview-data";

export function LandingHomePreview() {
  return (
    <div className="h-full overflow-y-auto px-3 pb-6 scrollbar-thin md:px-4">
      <div className="flex flex-col gap-6 pt-2">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricSummaryCard
            label="Total memories"
            value={
              <AnimatedCounter
                value={demoDashboard.totalMemories}
                duration={0.8}
              />
            }
            icon={IconBrain}
            index={0}
            animate
            trendData={[...demoDashboard.totalTrend]}
            strokeClassName="text-foreground/70"
          />
          <MetricSummaryCard
            label="Added today"
            value={
              <AnimatedCounter
                value={demoDashboard.addedToday}
                duration={0.8}
              />
            }
            icon={IconSparkles}
            index={1}
            animate
            trendData={[...demoDashboard.newTrend]}
            strokeClassName="text-accent"
          />
          <MetricSummaryCard
            label="This week"
            value={
              <AnimatedCounter value={demoDashboard.thisWeek} duration={0.8} />
            }
            icon={IconCalendarWeek}
            index={2}
            animate
          />
          <MetricSummaryCard
            label="Tags used"
            value={
              <AnimatedCounter value={demoDashboard.tagsUsed} duration={0.8} />
            }
            icon={IconTags}
            index={3}
            animate
          />
        </div>

        <Card className="shadow-none">
          <CardContent className="space-y-3 p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <IconMoonStars size={16} className="text-muted" stroke={1.5} />
              <h3 className="text-sm font-medium text-foreground text-balance">
                Inferred portrait
              </h3>
            </div>
            <p className="text-pretty text-sm leading-relaxed text-muted">
              {demoDashboard.portrait}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
