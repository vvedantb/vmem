import { IconChartBarOff } from "@tabler/icons-react";
import { motion } from "motion/react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@vmem/backend";
import { formatMonthDay } from "@vmem/shared";
import { Card, CardContent } from "@vvedantb/ui";

type GrowthData = FunctionReturnType<
  typeof api.dashboardApi.getStats
>["growthData"];

const CHART_HEIGHT = 180;

const CHART_GRID_LINES = (
  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
    <div className="h-px w-full bg-separator" />
    <div className="h-px w-full bg-separator" />
    <div className="h-px w-full bg-separator" />
  </div>
);

function maxGrowthNew(growthData: GrowthData): number {
  let maxNew = 1;
  for (const day of growthData) {
    if (day.new > maxNew) maxNew = day.new;
  }
  return maxNew;
}

export function MemoryGrowthChart({ growthData }: { growthData: GrowthData }) {
  if (growthData.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="shadow-none">
          <CardContent className="p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-1 sm:mb-6">
              <h2 className="text-base font-medium text-foreground sm:text-lg text-balance">
                Memory growth
              </h2>
              <p className="text-sm text-muted">Last 7 days</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-tertiary/60">
                <IconChartBarOff
                  size={22}
                  className="text-muted"
                  stroke={1.5}
                />
              </div>
              <p className="text-sm text-muted">
                No growth data yet — add memories to see trends here.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const maxNew = maxGrowthNew(growthData);
  const plotHeight = CHART_HEIGHT - 30;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="shadow-none">
        <CardContent className="p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-1 sm:mb-6">
            <h2 className="text-base font-medium text-foreground sm:text-lg text-balance">
              Memory growth
            </h2>
            <p className="text-sm text-muted">Last 7 days</p>
          </div>

          <div className="relative" style={{ height: CHART_HEIGHT + 40 }}>
            <div className="absolute left-0 top-0 flex h-full flex-col justify-between pr-2 text-xs tabular-nums text-muted">
              <span>{maxNew}</span>
              <span>{Math.round(maxNew / 2)}</span>
              <span>0</span>
            </div>

            <div className="relative ml-8 h-full">
              {CHART_GRID_LINES}

              <div
                className="flex items-end justify-between gap-1.5 sm:gap-2"
                style={{ height: CHART_HEIGHT }}
              >
                {growthData.map((day, index) => {
                  const barHeight = (day.new / maxNew) * plotHeight;

                  return (
                    <div
                      key={`${day.isoDate}-${index}`}
                      className="flex flex-1 flex-col items-center"
                    >
                      <div
                        className="group relative w-full max-w-12"
                        style={{ height: plotHeight }}
                      >
                        <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap glass-panel-strong smooth-shadow-ring-md rounded-full px-2.5 py-1 text-xs text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          {day.new} added
                        </div>

                        <div
                          className="absolute bottom-0 w-full rounded-t-md bg-foreground transition-[height] duration-300"
                          style={{ height: barHeight }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex justify-between gap-1">
                {growthData.map((day, index) => (
                  <div
                    key={`label-${day.isoDate}-${index}`}
                    className="flex-1 text-center text-[11px] text-muted sm:text-xs"
                  >
                    {formatMonthDay(day.isoDate)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
