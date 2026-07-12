"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconFileText,
  IconKey,
  IconNetwork,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Card, CardContent } from "@vmem/ui";
import { useActiveProfile } from "@/components/workspace/active-profile";

/**
 * `href` is workspace-relative (resolved against the active profile) except
 * `/settings/**`, which is user-level and passes through unprefixed.
 */
const quickActions: {
  label: string;
  href: string;
  icon: TablerIcon;
  description: string;
}[] = [
  {
    label: "Add memory",
    href: "/memories/list",
    icon: IconPlus,
    description: "Create a new memory",
  },
  {
    label: "Search",
    href: "/memories/list",
    icon: IconSearch,
    description: "Find memories",
  },
  {
    label: "Graph view",
    href: "/memories/graph",
    icon: IconNetwork,
    description: "Visualize connections",
  },
  {
    label: "Files",
    href: "/files",
    icon: IconFileText,
    description: "Manage uploads",
  },
  {
    label: "API keys",
    href: "/settings/api",
    icon: IconKey,
    description: "Manage access",
  },
];

export function QuickActionsGrid() {
  const activeProfile = useActiveProfile();
  const resolveHref = (href: string) =>
    href.startsWith("/settings") ? href : `/${activeProfile._id}${href}`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="shadow-none">
        <CardContent className="p-5 sm:p-6">
          <h2 className="mb-4 text-base font-medium text-foreground sm:mb-5 sm:text-lg text-balance">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.34 + index * 0.04,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <Link
                  to={resolveHref(action.href)}
                  className="group flex flex-col gap-1.5 rounded-lg px-4 py-3.5 transition-[background-color] hover:bg-surface-tertiary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary/60 transition-[background-color] group-hover:bg-surface-tertiary">
                      <action.icon
                        size={16}
                        className="text-muted"
                        stroke={1.5}
                      />
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {action.label}
                    </span>
                  </div>
                  <p className="pl-11 text-xs text-muted">
                    {action.description}
                  </p>
                </Link>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
