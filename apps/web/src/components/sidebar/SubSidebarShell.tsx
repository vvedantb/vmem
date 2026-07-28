import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn, motionDuration, motionEase } from "@vmem/ui";

type SubSidebarShellProps = {
  isMobile: boolean;
  children: ReactNode;
};

export function SubSidebarShell({ isMobile, children }: SubSidebarShellProps) {
  return (
    <motion.nav
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        isMobile ? "pb-2" : "pr-1",
      )}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {children}
    </motion.nav>
  );
}
