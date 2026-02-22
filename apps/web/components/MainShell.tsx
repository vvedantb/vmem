"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { defaultTransition } from "@vmem/ui";
import Sidebar from "@/components/Sidebar";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="relative h-screen overflow-hidden bg-sidebar">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <motion.main
        layout
        transition={defaultTransition}
        className={`relative z-10 flex h-full box-border pt-12 md:h-screen md:p-2 md:px-2 md:pb-2 ${
          isSidebarCollapsed ? "md:ml-24" : "md:ml-80"
        }`}
      >
        <motion.div
          layout
          transition={defaultTransition}
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card/95 shadow-soft md:rounded-3xl dark:shadow-panel"
        >
          <div className="flex-1 overflow-y-auto p-3 md:p-5 scrollbar-thin">
            {children}
          </div>
        </motion.div>
      </motion.main>
    </div>
  );
}
