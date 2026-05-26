"use client";

import type { TablerIcon } from "@tabler/icons-react";
import {
  IconFileText,
  IconKey,
  IconMessage,
  IconNetwork,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";

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
    label: "Chat",
    href: "/chat",
    icon: IconMessage,
    description: "Query your memories",
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
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl bg-surface-secondary/40 p-5 sm:p-6"
    >
      <h2 className="mb-4 text-base font-medium text-foreground sm:mb-5 sm:text-lg">
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
              to={action.href}
              className="group flex flex-col gap-1.5 rounded-xl bg-surface-secondary/30 px-4 py-3.5 transition-[background-color] hover:bg-surface-secondary/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary/60 transition-[background-color] group-hover:bg-surface-secondary/80">
                  <action.icon size={16} className="text-muted" stroke={1.5} />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {action.label}
                </span>
              </div>
              <p className="pl-11 text-xs text-muted">{action.description}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
