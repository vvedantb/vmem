"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

export default function MainShell({ children }: { children: React.ReactNode }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="relative h-screen overflow-hidden bg-sidebar">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />
      <main
        className={`relative z-10 flex h-full box-border pt-[4.75rem] md:h-screen md:p-2 md:px-2 md:pb-2 ${
          isSidebarCollapsed ? "md:ml-24" : "md:ml-80"
        } md:transition-[margin-left] md:duration-[280ms] md:ease-[cubic-bezier(0.22,1,0.36,1)]`}
      >
        <div className="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden md:rounded-3xl">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 scrollbar-thin">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
