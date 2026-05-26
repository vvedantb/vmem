"use client";

import type { FunctionReturnType } from "convex/server";
import { IconActivity } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { api } from "@vmem/backend";
import { getActivityIcon, getActivityLabel } from "./_utils";

type ActivityItem = FunctionReturnType<
  typeof api.dashboardApi.getRecentActivity
>[number];

interface RecentActivityListProps {
  activity: ActivityItem[];
}

export function RecentActivityList({ activity }: RecentActivityListProps) {
  const items = activity.slice(0, 6);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl bg-surface-secondary/40 p-5 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
        <h2 className="text-base font-medium text-foreground sm:text-lg">
          Recent activity
        </h2>
        <Link
          to="/activity/events"
          className="text-xs text-muted transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-secondary/60">
            <IconActivity size={22} className="text-muted" stroke={1.5} />
          </div>
          <p className="max-w-xs text-sm text-muted">
            Nothing recent yet. Create a memory or upload a file to get started.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => {
            const Icon = getActivityIcon(item.type);
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.32 + index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-[background-color] hover:bg-surface-secondary/50">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary/60">
                    <Icon size={16} className="text-muted" stroke={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p className="truncate text-sm text-foreground">
                        {getActivityLabel(item.description)}
                      </p>
                      <p className="shrink-0 text-xs tabular-nums text-muted">
                        {item.relativeTime}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.section>
  );
}
